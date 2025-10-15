const GEMINI_API_KEY = 'AIzaSyArd87o_wRn21M_SiAiTWtrNosgN_Jsq9o';
const MODEL_NAME = 'gemini-1.5-flash';
const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`;

const chatArea = document.querySelector('#chat-area');
const composerForm = document.querySelector('#composer-form');
const promptInput = document.querySelector('#prompt-input');
const imageInput = document.querySelector('#image-input');
const statusIndicator = document.querySelector('#status-indicator');

const conversation = [
  {
    role: 'model',
    parts: [
      { text: 'Привет! Я WORDSOFT AI. Чем могу помочь?' }
    ]
  }
];

let pendingImage = null;

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

  bubble.textContent = content;

  if (imageSrc) {
    const img = document.createElement('img');
    img.src = imageSrc;
    img.alt = 'Загруженное изображение пользователя';
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
  const button = composerForm.querySelector('button');
  button.disabled = isLoading;
  promptInput.disabled = isLoading;
  imageInput.disabled = isLoading;
  statusIndicator.textContent = isLoading ? 'WORDSOFT AI думает…' : 'Готов к общению';
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

  let imagePreview = null;
  if (pendingImage) {
    messageParts.push({
      inlineData: {
        mimeType: pendingImage.type,
        data: await fileToBase64(pendingImage)
      }
    });
    imagePreview = URL.createObjectURL(pendingImage);
  }

  conversation.push({
    role: 'user',
    parts: messageParts
  });

  appendMessage('user', text || ' ', imagePreview);
  promptInput.value = '';
  promptInput.style.height = 'auto';
  pendingImage = null;
  imageInput.value = '';
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
      body: JSON.stringify({ contents: conversation.filter(entry => entry.role !== 'model' || entry.parts[0].text !== 'Привет! Я WORDSOFT AI. Чем могу помочь?') })
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
    loadingMessage.remove();
    appendMessage('model', 'Произошла ошибка при обращении к модели. Попробуйте ещё раз позже.');
  } finally {
    setLoadingState(false);
  }
}

composerForm.addEventListener('submit', handleSubmit);

promptInput.addEventListener('input', () => {
  promptInput.style.height = 'auto';
  promptInput.style.height = `${promptInput.scrollHeight}px`;
});

imageInput.addEventListener('change', () => {
  const file = imageInput.files?.[0];
  if (!file) {
    pendingImage = null;
    return;
  }

  const maxSizeMB = 4;
  if (file.size > maxSizeMB * 1024 * 1024) {
    alert(`Размер файла превышает ${maxSizeMB} МБ. Пожалуйста, выберите изображение поменьше.`);
    imageInput.value = '';
    pendingImage = null;
    return;
  }

  pendingImage = file;
});
