// VENICE API CONFIG
const API_QUEUE_URL = "https://api.venice.ai/api/v1/video/queue";
const API_QUOTE_URL = "https://api.venice.ai/api/v1/video/quote";
const API_POLL_URL = "https://api.venice.ai/api/v1/video/retrieve";

// DOM ELEMENTS
const modelSelect = document.getElementById('model-select');
const modelInfoMsg = document.getElementById('model-info-msg');
const klingUi = document.getElementById('kling-ui');
const grokUi = document.getElementById('grok-ui');

// Settings
const aspectRatio = document.getElementById('aspect-ratio');
const duration = document.getElementById('duration');
const audioToggle = document.getElementById('audio-toggle');
const resolutionToggle = document.getElementById('resolution-toggle');
const audioSettingItem = document.getElementById('audio-setting-item');
const resolutionSettingItem = document.getElementById('resolution-setting-item');

// Inputs
const promptInput = document.getElementById('prompt-input');
const apiKeyInput = document.getElementById('api-key');

// Buttons
const btnGenerate = document.getElementById('btn-generate');
const btnQuote = document.getElementById('btn-quote');
const btnClear = document.getElementById('btn-clear');
const btnAddElement = document.getElementById('btn-add-element');
const btnEnhancePrompt = document.getElementById('btn-enhance-prompt');

// Containers
const elementsContainer = document.getElementById('elements-container');
const logConsole = document.getElementById('log-console');
const outputContent = document.getElementById('output-content');
const queueStatus = document.getElementById('queue-status');
const statusDot = document.getElementById('status-dot');
const outputStatusBadge = document.getElementById('output-status-badge');
const elementTemplate = document.getElementById('element-template');
const refTagsContainer = document.getElementById('ref-tags');

// STATE
let elementsData = [];
let klingSceneData = [];
let klingStartData = null;
let grokRefData = [];

// UTILS
function log(msg, type = 'info') {
    const p = document.createElement('p');
    p.innerText = `> ${msg}`;
    if (type === 'error') p.className = 'log-error';
    if (type === 'success') p.className = 'log-success';
    logConsole.appendChild(p);
    logConsole.scrollTop = logConsole.scrollHeight;
}

function setStatus(text, state) {
    queueStatus.innerText = text;
    statusDot.className = 'status-dot';
    outputStatusBadge.className = 'output-status';
    if (state === 'ready') {
        outputStatusBadge.classList.add('ready');
        outputStatusBadge.innerText = 'Ready';
    } else if (state === 'processing') {
        statusDot.classList.add('processing');
        outputStatusBadge.classList.add('processing');
        outputStatusBadge.innerText = text;
    } else if (state === 'complete') {
        outputStatusBadge.classList.add('complete');
        outputStatusBadge.innerText = 'Complete';
    } else if (state === 'error') {
        statusDot.classList.add('error');
        outputStatusBadge.classList.add('error');
        outputStatusBadge.innerText = text;
    }
}

const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
});

// ImgBB API key
const IMGBB_API_KEY = 'd90955efed83e475e5d0b37cabb746fa';

async function uploadToImageHost(file) {
    if (!IMGBB_API_KEY || IMGBB_API_KEY === 'YOUR_IMGBB_API_KEY_HERE') {
        log('ImgBB API key not set. Using base64.', 'error');
        return await fileToBase64(file);
    }

    const formData = new FormData();
    formData.append('image', file);

    try {
        const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
            method: 'POST',
            body: formData
        });

        if (!res.ok) throw new Error(`Upload failed: ${res.status}`);

        const data = await res.json();
        if (data.success && data.data && data.data.url) {
            return data.data.url;
        } else {
            throw new Error('Invalid response from ImgBB');
        }
    } catch (e) {
        log(`Upload failed: ${e.message}. Using base64 fallback.`, 'error');
        return await fileToBase64(file);
    }
}

function setupFileDrop(dropZone, inputElement) {
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) {
            inputElement.files = e.dataTransfer.files;
            inputElement.dispatchEvent(new Event('change', { bubbles: false }));
        }
    });
}

// ========================
// PROMPT NORMALIZATION
// ========================
// Automatically fix @image1 → @Image1, @IMAGE2 → @Image2, etc.
// This runs before sending so users don't need to worry about case.
function normalizePromptText(text) {
    return text.replace(/@image(\d+)/gi, (_m, num) => `@Image${num}`)
               .replace(/@element(\d+)/gi, (_m, num) => `@Element${num}`);
}

// ========================
// REFERENCE TAG BUTTONS
// ========================
function updateRefTags() {
    refTagsContainer.innerHTML = '';
    for (let i = 0; i < grokRefData.length; i++) {
        const btn = document.createElement('button');
        btn.className = 'ref-tag-btn';
        btn.innerText = `@Image${i + 1}`;
        btn.addEventListener('click', () => {
            // Insert tag at cursor or end of prompt
            promptInput.focus();
            const sel = window.getSelection();
            const tag = `@Image${i + 1} `;
            if (sel.rangeCount) {
                const range = sel.getRangeAt(0);
                // Only insert at cursor if inside prompt
                if (promptInput.contains(range.commonAncestorContainer)) {
                    range.deleteContents();
                    range.insertNode(document.createTextNode(tag));
                    range.collapse(false);
                } else {
                    promptInput.innerText += tag;
                }
            } else {
                promptInput.innerText += tag;
            }
        });
        refTagsContainer.appendChild(btn);
    }
}

// ========================
// MODEL SWITCHING
// ========================
modelSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val.includes('kling')) {
        klingUi.classList.remove('hidden');
        grokUi.classList.add('hidden');
        modelInfoMsg.innerHTML = 'Configure identity elements, scene images, and start frame below.';
        audioSettingItem.classList.remove('hidden');
        resolutionSettingItem.classList.add('hidden');
    } else {
        klingUi.classList.add('hidden');
        grokUi.classList.remove('hidden');
        modelInfoMsg.innerHTML = 'Upload 1–7 reference images, then describe your video using <strong>@Image1</strong>, <strong>@Image2</strong>, etc.';
        audioSettingItem.classList.add('hidden');
        resolutionSettingItem.classList.remove('hidden');
    }
});

// ========================
// KLING ELEMENTS LOGIC
// ========================
let elementCounter = 0;
btnAddElement.addEventListener('click', () => {
    if (elementsData.length >= 7) {
        log('Maximum 7 elements reached.', 'error');
        return;
    }

    elementCounter++;
    const id = Date.now().toString();
    elementsData.push({ id, frontal: null, refs: [] });

    const tpl = elementTemplate.content.cloneNode(true);
    const card = tpl.querySelector('.element-card');
    card.dataset.id = id;
    card.innerHTML = card.innerHTML.replace(/{num}/g, elementCounter).replace(/{id}/g, id);

    const btnRemove = card.querySelector('.btn-remove-element');
    btnRemove.addEventListener('click', () => {
        card.remove();
        elementsData = elementsData.filter(e => e.id !== id);
        log(`Element removed.`);
    });

    const frontalInput = card.querySelector('.frontal-input');
    const frontalDrop = card.querySelector('.frontal-box');
    const previewImg = card.querySelector('.preview-img');

    frontalDrop.addEventListener('click', () => frontalInput.click());
    frontalInput.addEventListener('change', async (e) => {
        if (!e.target.files || !e.target.files.length) return;
        const file = e.target.files[0];
        if (file) {
            const b64 = await fileToBase64(file);
            const el = elementsData.find(el => el.id === id);
            if (el) {
                el.frontal = b64;
                previewImg.style.backgroundImage = `url(${b64})`;
                previewImg.classList.remove('hidden');
                card.querySelector('.drop-zone-text').classList.add('hidden');
                log(`Frontal set for Element ${elementCounter}`);
            }
            setTimeout(() => { e.target.value = ''; }, 100);
        }
    });
    setupFileDrop(frontalDrop, frontalInput);

    const refInput = card.querySelector('.element-ref-input');
    const refDrop = card.querySelector('.ref-box');
    const refPreviewRow = card.querySelector('.element-refs-preview');

    refDrop.addEventListener('click', () => refInput.click());
    refInput.addEventListener('change', async (e) => {
        const el = elementsData.find(el => el.id === id);
        if (!el) return;
        if (!e.target.files || e.target.files.length === 0) return;

        const files = Array.from(e.target.files);
        for (let i = 0; i < files.length; i++) {
            if (el.refs.length >= 3) break;
            const b64 = await fileToBase64(files[i]);
            el.refs.push(b64);

            const chip = document.createElement('div');
            chip.className = 'preview-chip';
            chip.style.backgroundImage = `url(${b64})`;

            const label = document.createElement('div');
            label.className = 'chip-label';
            label.innerText = `Ref${el.refs.length}`;
            chip.appendChild(label);

            refPreviewRow.appendChild(chip);
        }
        log(`Ref angles updated for Element ${elementCounter}`);
        setTimeout(() => { e.target.value = ''; }, 100);
    });
    setupFileDrop(refDrop, refInput);

    elementsContainer.appendChild(card);
    log(`Element @Element${elementCounter} added.`);
});

// KLING SCENE
const sceneDrop = document.getElementById('kling-scene-drop');
const sceneInput = document.getElementById('kling-scene-input');
const scenePreview = document.getElementById('kling-scene-preview');

sceneDrop.addEventListener('click', () => sceneInput.click());
sceneInput.addEventListener('change', async (e) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);
    for (let i = 0; i < files.length; i++) {
        if (klingSceneData.length >= 4) break;
        const b64 = await fileToBase64(files[i]);
        klingSceneData.push(b64);

        const chip = document.createElement('div');
        chip.className = 'preview-chip';
        chip.style.backgroundImage = `url(${b64})`;
        scenePreview.appendChild(chip);
    }
    log(`Scene refs loaded. Total: ${klingSceneData.length}`);
    setTimeout(() => { e.target.value = ''; }, 100);
});
setupFileDrop(sceneDrop, sceneInput);

// ========================
// GROK REFERENCE IMAGES
// ========================
const grokDrop = document.getElementById('grok-ref-drop');
const grokInput = document.getElementById('grok-ref-input');
const grokPreview = document.getElementById('grok-ref-preview');

grokDrop.addEventListener('click', (e) => {
    e.stopPropagation();
    grokInput.click();
});

grokInput.addEventListener('change', async (e) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const files = Array.from(e.target.files);

    for (let i = 0; i < files.length; i++) {
        if (grokRefData.length >= 7) break;

        log(`Uploading image ${grokRefData.length + 1}...`);
        const imageUrl = await uploadToImageHost(files[i]);
        log(`Image ${grokRefData.length + 1} uploaded.`, 'success');

        grokRefData.push(imageUrl);

        const idx = grokRefData.length;

        // Preview with remove button
        const item = document.createElement('div');
        item.className = 'preview-item';
        item.style.backgroundImage = `url(${imageUrl})`;

        const label = document.createElement('div');
        label.className = 'preview-label';
        label.innerText = `@Image${idx}`;
        item.appendChild(label);

        const removeBtn = document.createElement('div');
        removeBtn.className = 'preview-remove';
        removeBtn.innerText = '×';
        removeBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            // Find which index this is in current state
            const itemIdx = Array.from(grokPreview.children).indexOf(item);
            if (itemIdx >= 0) {
                grokRefData.splice(itemIdx, 1);
                item.remove();
                // Re-label all remaining previews
                Array.from(grokPreview.children).forEach((child, ci) => {
                    const lbl = child.querySelector('.preview-label');
                    if (lbl) lbl.innerText = `@Image${ci + 1}`;
                });
                updateRefTags();
                log(`Image removed. ${grokRefData.length} image(s) remaining.`);
            }
        });
        item.appendChild(removeBtn);

        grokPreview.appendChild(item);
    }

    updateRefTags();
    log(`${grokRefData.length} image(s) ready.`);
    e.target.value = '';
});

setupFileDrop(grokDrop, grokInput);

// ========================
// PROMPT HIGHLIGHTING
// ========================
promptInput.addEventListener('blur', () => {
    let text = promptInput.innerText;
    text = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // Normalize first, then highlight
    text = normalizePromptText(text);
    text = text.replace(/(@Image\d+|@Element\d+)/g, '<span class="ref-highlight">$1</span>');
    promptInput.innerHTML = text;
});

// ========================
// ENHANCE PROMPT
// ========================
btnEnhancePrompt.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    if (!key) { log('Enter your API key first.', 'error'); return; }

    let text = promptInput.innerText.trim();
    if (!text) { log('Write a prompt first, then enhance it.', 'error'); return; }

    log('Enhancing prompt with AI...');
    btnEnhancePrompt.disabled = true;

    try {
        const res = await fetch("https://api.venice.ai/api/v1/chat/completions", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify({
                model: "mistral-small-2603",
                messages: [
                    {
                        role: "system",
                        content: `You are an expert AI video prompt engineer specializing in reference-to-video generation. Users upload photos of real people and places, then describe a scene. Your job is to enhance their prompt into a vivid, cinematic video description.

RULES:
- Preserve ALL @ImageX or @ElementX tags exactly — correct case is @Image1, @Image2, etc. Never change or remove them.
- If the prompt involves people or faces (@Image1, @Image2, etc.), describe how they appear in the scene: their expression, pose, movement, interaction with each other and the environment.
- Add cinematic detail: camera movement (slow push-in, tracking shot, aerial pull-back, etc.), lighting (golden hour, neon-lit, soft diffused, dramatic rim light, etc.), mood, and atmosphere.
- Keep it under 150 words. Be vivid and specific.
- Do NOT explain what you did. Output ONLY the enhanced prompt text.`
                    },
                    { role: "user", content: text }
                ]
            })
        });

        if (!res.ok) throw new Error(`Chat API failed: ${res.status}`);
        const data = await res.json();

        let enhanced = data.choices[0].message.content;
        // Normalize any case issues from the AI
        enhanced = normalizePromptText(enhanced);
        enhanced = enhanced.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        enhanced = enhanced.replace(/(@Image\d+|@Element\d+)/g, '<span class="ref-highlight">$1</span>');

        promptInput.innerHTML = enhanced;
        log('Prompt enhanced.', 'success');
    } catch (e) {
        log(`Enhance failed: ${e.message}`, 'error');
    } finally {
        btnEnhancePrompt.disabled = false;
    }
});

// ========================
// PAYLOAD BUILDER
// ========================
function buildPayload(isQuote = false) {
    const model = modelSelect.value;
    const isGrok = !model.includes('kling');
    let payload = { model };

    if (isGrok) {
        payload.duration = `${duration.value}s`;
        payload.aspect_ratio = aspectRatio.value;
        payload.resolution = resolutionToggle.value;
    } else {
        let dur = duration.value.toString();
        if (!dur.endsWith('s')) dur += 's';
        payload.duration = dur;
        payload.aspect_ratio = aspectRatio.value;
        payload.audio = audioToggle.value === 'true';
    }

    if (isQuote) return payload;

    let promptText = promptInput.innerText.trim();
    if (!promptText) throw new Error('Write a prompt describing your video.');

    // Normalize @image references to correct case before sending
    promptText = normalizePromptText(promptText);
    payload.prompt = promptText;

    if (isGrok) {
        if (grokRefData.length === 0) {
            throw new Error('Upload at least 1 reference image (max 7).');
        }
        payload.image_url = grokRefData[0];
        payload.reference_image_urls = grokRefData;
    } else {
        const elementsApiData = elementsData.map(e => ({
            frontal_image_url: e.frontal,
            reference_image_urls: e.refs.length > 0 ? e.refs : undefined
        })).filter(e => e.frontal_image_url);

        if (elementsApiData.length > 0) payload.elements = elementsApiData;
        if (klingSceneData.length > 0) payload.image_urls = klingSceneData;

        if (!payload.elements && !payload.image_urls) {
            throw new Error('Kling requires at least 1 Element or Scene Reference.');
        }
    }

    return payload;
}

// ========================
// ESTIMATE
// ========================
btnQuote.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    if (!key) { log('Enter your API key first.', 'error'); return; }

    log('Requesting cost estimate...');
    try {
        const payload = buildPayload(true);
        const res = await fetch(API_QUOTE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(`Quote failed: ${res.status}`);
        const data = await res.json();
        log(`Estimate: $${data.quote} USD`, 'success');
        setStatus(`$${data.quote}`, 'ready');
    } catch (e) {
        log(e.message, 'error');
    }
});

// ========================
// GENERATE VIDEO
// ========================
btnGenerate.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    if (!key) { log('Enter your API key first.', 'error'); return; }

    let payload;
    try {
        payload = buildPayload();
    } catch (e) {
        log(e.message, 'error');
        return;
    }

    log(`Generating video with ${payload.model}...`);
    setStatus('Queuing...', 'processing');
    btnGenerate.disabled = true;

    try {
        console.log('Full payload being sent:', JSON.stringify(payload, null, 2));

        const res = await fetch(API_QUEUE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errBody = await res.text();
            throw new Error(`Queue failed: ${res.status} - ${errBody}`);
        }

        const data = await res.json();
        console.log('Queue response:', JSON.stringify(data, null, 2));

        const queueId = data.id || data.queue_id;
        if (!queueId) throw new Error('No queue ID in response: ' + JSON.stringify(data));

        const responseModel = data.model || payload.model;
        log(`Queued! ID: ${queueId}`, 'success');

        pollVideoResult(queueId, responseModel, key);

    } catch (err) {
        log(`API Error: ${err.message}`, 'error');
        setStatus('Error', 'error');
        btnGenerate.disabled = false;
    }
});

// ========================
// POLLING
// ========================
async function pollVideoResult(queueId, model, apiKey) {
    setStatus('Rendering...', 'processing');
    let attempts = 0;
    const maxAttempts = 120;

    const poll = setInterval(async () => {
        attempts++;
        if (attempts > maxAttempts) {
            clearInterval(poll);
            log('Polling timeout after 10 minutes.', 'error');
            setStatus('Timeout', 'error');
            btnGenerate.disabled = false;
            return;
        }

        try {
            log(`Polling... (${attempts}/${maxAttempts})`);

            const res = await fetch(API_POLL_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({ model, queue_id: queueId })
            });

            if (res.status === 404) return;

            if (!res.ok) {
                const errBody = await res.text();
                throw new Error(`Poll ${res.status}: ${errBody}`);
            }

            const contentType = res.headers.get("Content-Type") || "";

            if (contentType.includes("video/mp4")) {
                clearInterval(poll);
                const blob = await res.blob();
                const videoUrl = URL.createObjectURL(blob);

                log('Video ready!', 'success');
                setStatus('Complete', 'complete');
                btnGenerate.disabled = false;

                outputContent.innerHTML = `
                    <div style="display:flex; flex-direction:column; align-items:center; gap:12px; width:100%;">
                        <video class="video-player" src="${videoUrl}" controls autoplay loop></video>
                        <a href="${videoUrl}" download="venice-video.mp4" class="btn btn-download">Download Video</a>
                    </div>
                `;
            } else {
                const data = await res.json();
                console.log('Poll response:', JSON.stringify(data, null, 2));

                if (data.status === 'failed' || data.status === 'error') {
                    clearInterval(poll);
                    log(`Render failed: ${data.error || JSON.stringify(data)}`, 'error');
                    setStatus('Failed', 'error');
                    btnGenerate.disabled = false;
                }
            }
        } catch (e) {
            log(`Poll warning: ${e.message}`, 'error');
            if (e.message.includes("Poll 400") || e.message.includes("Poll 401") || e.message.includes("Poll 422")) {
                clearInterval(poll);
                setStatus('Error', 'error');
                btnGenerate.disabled = false;
            }
        }
    }, 5000);
}

// ========================
// CLEAR ALL
// ========================
btnClear.addEventListener('click', () => {
    elementsData = [];
    klingSceneData = [];
    grokRefData = [];
    elementsContainer.innerHTML = '';
    scenePreview.innerHTML = '';
    grokPreview.innerHTML = '';
    promptInput.innerHTML = '';
    refTagsContainer.innerHTML = '';
    log('All cleared.');
    outputContent.innerHTML = '<div class="output-placeholder"><div class="placeholder-icon">▶</div><div>Your generated video will appear here</div></div>';
    setStatus('Ready', 'ready');
});

// ========================
// INIT
// ========================
log('Viv Imagine initialized.');

const savedKey = localStorage.getItem('venice_api_key');
if (savedKey) {
    apiKeyInput.value = savedKey;
    log('API key restored from storage.');
}

apiKeyInput.addEventListener('input', (e) => {
    localStorage.setItem('venice_api_key', e.target.value.trim());
});
