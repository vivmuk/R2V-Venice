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
const elementTemplate = document.getElementById('element-template');

// STATE
let elementsData = []; // { id, frontal: base64, refs: [base64...] }
let klingSceneData = []; // [base64...]
let klingStartData = null; // base64
let grokRefData = []; // [base64...]

// UTILS
function log(msg, type = 'info') {
    const p = document.createElement('p');
    p.innerText = `> ${msg}`;
    if (type === 'error') p.className = 'log-error';
    if (type === 'success') p.className = 'log-success';
    logConsole.appendChild(p);
    logConsole.scrollTop = logConsole.scrollHeight;
}

const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
});

// ImgBB API key - get yours free at https://api.imgbb.com/
const IMGBB_API_KEY = 'd90955efed83e475e5d0b37cabb746fa'; // Replace with your key

// Upload image to ImgBB (free image host) and return URL
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
        dropZone.style.borderColor = "var(--primary)";
    });
    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.style.borderColor = "";
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.style.borderColor = "";
        if (e.dataTransfer.files.length > 0) {
            inputElement.files = e.dataTransfer.files;
            inputElement.dispatchEvent(new Event('change', { bubbles: false }));
        }
    });
}

// UI EVENT LISTENERS
modelSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val.includes('kling')) {
        klingUi.classList.remove('hidden');
        grokUi.classList.add('hidden');
        modelInfoMsg.innerText = `Kling O3 selected. Configure identity elements below.`;
        audioSettingItem.classList.remove('hidden');
        resolutionSettingItem.classList.add('hidden');
    } else {
        klingUi.classList.add('hidden');
        grokUi.classList.remove('hidden');
        modelInfoMsg.innerText = `Grok Imagine selected. Upload 1-7 reference images.`;
        audioSettingItem.classList.add('hidden');
        resolutionSettingItem.classList.remove('hidden');
    }
});

// KLING ELEMENTS LOGIC
let elementCounter = 0;
btnAddElement.addEventListener('click', () => {
    if (elementsData.length >= 7) {
        log('MAXIMUM ELEMENTS REACHED [7]', 'error');
        return;
    }
    
    elementCounter++;
    const id = Date.now().toString();
    elementsData.push({ id, frontal: null, refs: [] });
    
    const tpl = elementTemplate.content.cloneNode(true);
    const card = tpl.querySelector('.element-card');
    card.dataset.id = id;
    
    // Replace placeholders
    card.innerHTML = card.innerHTML.replace(/{num}/g, elementCounter).replace(/{id}/g, id);
    
    // Bind Events
    const btnRemove = card.querySelector('.btn-remove-element');
    btnRemove.addEventListener('click', () => {
        card.remove();
        elementsData = elementsData.filter(e => e.id !== id);
        log(`Element @Element${elementCounter} Purged.`);
    });
    
    const frontalInput = card.querySelector('.frontal-input');
    const frontalDrop = card.querySelector('.frontal-box');
    const previewImg = card.querySelector('.preview-img');
    
    frontalDrop.addEventListener('click', () => frontalInput.click());
    frontalInput.addEventListener('change', async (e) => {
        if (!e.target.files || !e.target.files.length) return;
        const file = e.target.files[0];

        if(file) {
            const b64 = await fileToBase64(file);
            const el = elementsData.find(el => el.id === id);
            if(el) {
                el.frontal = b64;
                previewImg.style.backgroundImage = `url(${b64})`;
                previewImg.classList.remove('hidden');
                card.querySelector('.drop-text-sm').classList.add('hidden');
                log(`Frontal Anchor set for Element ${id.slice(-4)}`);
            }

            // Clear input after short delay
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
        if(!el) return;
        if (!e.target.files || e.target.files.length === 0) return;

        const files = Array.from(e.target.files);

        for (let i=0; i < files.length; i++) {
            if (el.refs.length >= 3) break;
            const b64 = await fileToBase64(files[i]);
            el.refs.push(b64);

            const chip = document.createElement('div');
            chip.className = 'preview-chip';
            chip.style.backgroundImage = `url(${b64})`;

            const label = document.createElement('div');
            label.className = 'chip-label';
            label.innerText = `@Ref${i+1}`;
            chip.appendChild(label);

            refPreviewRow.appendChild(chip);
        }
        log(`Ref Angles updated for Element ${id.slice(-4)}`);

        // Clear input after short delay
        setTimeout(() => { e.target.value = ''; }, 100);
    });
    setupFileDrop(refDrop, refInput);

    elementsContainer.appendChild(card);
    log(`New Element Container [${id.slice(-4)}] Initialized.`);
});

// KLING SCENE
const sceneDrop = document.getElementById('kling-scene-drop');
const sceneInput = document.getElementById('kling-scene-input');
const scenePreview = document.getElementById('kling-scene-preview');

sceneDrop.addEventListener('click', () => sceneInput.click());
sceneInput.addEventListener('change', async (e) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const files = Array.from(e.target.files);

    for (let i=0; i < files.length; i++) {
        if (klingSceneData.length >= 4) break;
        const b64 = await fileToBase64(files[i]);
        klingSceneData.push(b64);

        const chip = document.createElement('div');
        chip.className = 'preview-chip';
        chip.style.backgroundImage = `url(${b64})`;
        scenePreview.appendChild(chip);
    }
    log(`Scene refs loaded. Total: ${klingSceneData.length}`);

    // Clear input after short delay
    setTimeout(() => { e.target.value = ''; }, 100);
});
setupFileDrop(sceneDrop, sceneInput);

// GROK REFS
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

    for (let i=0; i < files.length; i++) {
        if (grokRefData.length >= 7) break;

        log(`Uploading image ${i+1} to ImgBB...`);
        const imageUrl = await uploadToImageHost(files[i]);
        log(`Image ${i+1} ready: ${imageUrl.substring(0, 50)}...`);

        grokRefData.push(imageUrl);

        const chip = document.createElement('div');
        chip.className = 'preview-chip';
        chip.style.backgroundImage = `url(${imageUrl})`;

        const label = document.createElement('div');
        label.className = 'chip-label';
        label.innerText = `@Image${grokRefData.length}`;
        chip.appendChild(label);

        grokPreview.appendChild(chip);
    }
    log(`${grokRefData.length} image(s) ready`);

    // Clear input value to allow re-selecting same files
    e.target.value = '';
});

setupFileDrop(grokDrop, grokInput);

// PROMPT UI HIGHIGHTER & ENHANCER
promptInput.addEventListener('blur', () => {
    let text = promptInput.innerText;
    text = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    text = text.replace(/(@Image\d+|@Element\d+)/g, '<span class="ref-highlight">$1</span>');
    promptInput.innerHTML = text;
});

btnEnhancePrompt.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    if (!key) { log('ERR: MISSING AUTH_TOKEN FOR ENHANCEMENT', 'error'); return; }
    
    let text = promptInput.innerText.trim();
    if (!text) { log('ERR: NO PROMPT TO ENHANCE', 'error'); return; }

    log('REQUESTING AI PROMPT ENHANCEMENT...');
    btnEnhancePrompt.disabled = true;
    
    try {
        const res = await fetch("https://api.venice.ai/api/v1/chat/completions", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify({
                model: "llama-3.3-70b",
                messages: [
                    { role: "system", content: "You are an expert video prompt engineer. Enhance the user's prompt for an AI Video generator. Ensure you preserve any @ImageX or @ElementX tags exactly as they are. Keep it under 150 words. Focus on lighting, camera movement, and clear action. Do not add any conversational filler, output ONLY the enhanced prompt." },
                    { role: "user", content: text }
                ]
            })
        });
        
        if (!res.ok) throw new Error(`Chat API Failed: ${res.status}`);
        const data = await res.json();
        
        let enhanced = data.choices[0].message.content;
        enhanced = enhanced.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        enhanced = enhanced.replace(/(@Image\d+|@Element\d+)/g, '<span class="ref-highlight">$1</span>');
        
        promptInput.innerHTML = enhanced;
        log('PROMPT ENHANCED SUCESSFULLY.', 'success');
    } catch (e) {
        log(`ENHANCE ERR: ${e.message}`, 'error');
    } finally {
        btnEnhancePrompt.disabled = false;
    }
});


// PAYLOAD BUILDER
// Grok R2V docs: https://docs.venice.ai/overview/guides/reference-to-video
function buildPayload(isQuote = false) {
    const model = modelSelect.value;
    const isGrok = !model.includes('kling');
    let payload = { model };

    if (isGrok) {
        // Grok R2V: production API requires 's' suffix ("5s", "8s", "10s")
        payload.duration = `${duration.value}s`;
        payload.aspect_ratio = aspectRatio.value;
        payload.resolution = resolutionToggle.value;
    } else {
        // Kling: duration with 's' suffix
        let dur = duration.value.toString();
        if (!dur.endsWith('s')) dur += 's';
        payload.duration = dur;
        payload.aspect_ratio = aspectRatio.value;
        payload.audio = audioToggle.value === 'true';
    }

    if (isQuote) return payload;

    const promptText = promptInput.innerText.trim();
    if (!promptText) throw new Error('PROMPT CANNOT BE EMPTY');
    payload.prompt = promptText;

    if (isGrok) {
        // Grok R2V production API requires both:
        // - image_url (validator requires this for all image-to-video models)
        // - reference_image_urls (snake_case array, generation engine needs this)
        if (grokRefData.length === 0) {
            throw new Error('Upload at least 1 reference image (max 7)');
        }
        payload.image_url = grokRefData[0];
        payload.reference_image_urls = grokRefData;
    } else {
        // Kling elements
        const elementsApiData = elementsData.map(e => ({
            frontal_image_url: e.frontal,
            reference_image_urls: e.refs.length > 0 ? e.refs : undefined
        })).filter(e => e.frontal_image_url);

        if (elementsApiData.length > 0) payload.elements = elementsApiData;
        if (klingSceneData.length > 0) payload.image_urls = klingSceneData;

        if (!payload.elements && !payload.image_urls) {
            throw new Error('KLING O3 reqs at least 1 Element or Scene Ref');
        }
    }

    return payload;
}

// ESTIMATE LOGIC
btnQuote.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    if (!key) { log('ERR: MISSING AUTH_TOKEN [API_KEY]', 'error'); return; }

    log('REQUESTING ESTIMATE QUOTE...');
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

        if (!res.ok) throw new Error(`Quote Failed: ${res.status}`);
        const data = await res.json();
        log(`ESTIMATE QUOTE: $${data.quote} USD`, 'success');
        queueStatus.innerText = `ESTIMATE: $${data.quote}`;
        queueStatus.className = "green";
    } catch (e) {
        log(e.message, 'error');
    }
});

// GENERATOR LOGIC
btnGenerate.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    if (!key) { log('ERR: MISSING AUTH_TOKEN [API_KEY]', 'error'); return; }

    let payload;
    try {
        payload = buildPayload();
    } catch(e) {
        log(`ERR: ${e.message}`, 'error');
        return;
    }

    log(`Generating video with ${payload.model}...`);
    queueStatus.innerText = "Queuing...";
    queueStatus.className = "blinking cyan";
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

        // Docs show response has "id" field
        const queueId = data.id || data.queue_id;
        if (!queueId) throw new Error('No queue ID in response: ' + JSON.stringify(data));

        const responseModel = data.model || payload.model;
        log(`Queue accepted. ID: ${queueId}`, 'success');

        pollVideoResult(queueId, responseModel, key);

    } catch (err) {
        log(`API Error: ${err.message}`, 'error');
        queueStatus.innerText = "Error";
        queueStatus.className = "log-error";
        btnGenerate.disabled = false;
    }
});

// POLLING - retrieve endpoint only needs model + queue_id
async function pollVideoResult(queueId, model, apiKey) {
    queueStatus.innerText = "Rendering...";
    let attempts = 0;
    const maxAttempts = 120;

    const poll = setInterval(async () => {
        attempts++;
        if (attempts > maxAttempts) {
            clearInterval(poll);
            log('Polling timeout after 10 minutes.', 'error');
            queueStatus.innerText = "Timeout";
            btnGenerate.disabled = false;
            return;
        }

        try {
            log(`Polling... (${attempts}/${maxAttempts})`);

            // Retrieve only needs model and queue_id
            const res = await fetch(API_POLL_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({ model, queue_id: queueId })
            });

            if (res.status === 404) return; // Not ready yet

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
                queueStatus.innerText = "Complete";
                queueStatus.className = "green";
                btnGenerate.disabled = false;

                outputContent.innerHTML = `
                    <video class="video-player" src="${videoUrl}" controls autoplay loop></video>
                `;
            } else {
                const data = await res.json();
                console.log('Poll response:', JSON.stringify(data, null, 2));

                if (data.status === 'failed' || data.status === 'error') {
                    clearInterval(poll);
                    log(`Render failed: ${data.error || JSON.stringify(data)}`, 'error');
                    queueStatus.innerText = "Failed";
                    queueStatus.className = "log-error";
                    btnGenerate.disabled = false;
                }
            }
        } catch(e) {
            log(`Poll warning: ${e.message}`, 'error');
            if (e.message.includes("Poll 400") || e.message.includes("Poll 401") || e.message.includes("Poll 422")) {
                clearInterval(poll);
                queueStatus.innerText = "Error";
                queueStatus.className = "log-error";
                btnGenerate.disabled = false;
            }
        }
    }, 5000);
}

// Clear all
btnClear.addEventListener('click', () => {
    elementsData = [];
    klingSceneData = [];
    grokRefData = [];
    elementsContainer.innerHTML = '';
    scenePreview.innerHTML = '';
    grokPreview.innerHTML = '';
    promptInput.innerHTML = '';
    log('SYS.PURGE COMPLETE.');
    outputContent.innerHTML = '<div class="placeholder-text">// NO DATA STREAM DETECTED</div>';
    queueStatus.innerText = "AWAITING_COMMAND...";
    queueStatus.className = "cyan";
});

// Init Log
log('Venice Video Studio initialized.');

// Local Storage for API key
const savedKey = localStorage.getItem('venice_api_key');
if (savedKey) {
    apiKeyInput.value = savedKey;
    log('API key restored from storage.');
}

apiKeyInput.addEventListener('input', (e) => {
    localStorage.setItem('venice_api_key', e.target.value.trim());
});
