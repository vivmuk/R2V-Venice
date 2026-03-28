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

function setupFileDrop(dropZone, inputElement) {
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = "var(--primary-color)";
    });
    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = "";
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = "";
        if (e.dataTransfer.files.length > 0) {
            inputElement.files = e.dataTransfer.files;
            inputElement.dispatchEvent(new Event('change'));
        }
    });
}

// UI EVENT LISTENERS
modelSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val.includes('kling')) {
        klingUi.classList.remove('hidden');
        grokUi.classList.add('hidden');
        modelInfoMsg.innerText = `// KLING_O3 SELECTED. REQUIRES IDENTITY ELEMENTS.`;
        audioSettingItem.classList.remove('hidden');
        resolutionSettingItem.classList.add('hidden');
    } else {
        klingUi.classList.add('hidden');
        grokUi.classList.remove('hidden');
        modelInfoMsg.innerText = `// GROK IMAGINE SELECTED. USES FLAT REF IMAGES (1-7).`;
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

grokDrop.addEventListener('click', () => grokInput.click());
grokInput.addEventListener('change', async (e) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const files = Array.from(e.target.files);

    for (let i=0; i < files.length; i++) {
        if (grokRefData.length >= 7) break;
        const b64 = await fileToBase64(files[i]);
        grokRefData.push(b64);

        const chip = document.createElement('div');
        chip.className = 'preview-chip';
        chip.style.backgroundImage = `url(${b64})`;

        const label = document.createElement('div');
        label.className = 'chip-label';
        label.innerText = `@Image${grokRefData.length}`;
        chip.appendChild(label);

        grokPreview.appendChild(chip);
    }
    log(`Grok refs loaded. Total: ${grokRefData.length}`);

    // Clear input after short delay to ensure all processing is complete
    setTimeout(() => { e.target.value = ''; }, 100);
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
function buildPayload(isQuote = false) {
    const model = modelSelect.value;
    let payload = { model };
    
    // Duration format: "5s", "8s", or "10s" with 's' suffix as API requires
    let dur = duration.value.toString();
    if (!dur.endsWith('s')) dur += 's';
    payload.duration = dur;

    if (model.includes('kling')) {
        payload.aspect_ratio = aspectRatio.value;
        payload.audio = audioToggle.value === 'true';
    } else {
        payload.aspect_ratio = aspectRatio.value;
        payload.resolution = resolutionToggle.value;
    }

    if (isQuote) return payload;

    // Full Generate Payload
    const promptText = promptInput.innerText.trim();
    if (!promptText) throw new Error('PROMPT CANNOT BE EMPTY');
    payload.prompt = promptText;

    if (model.includes('kling')) {
        // Build elements array
        const elementsApiData = elementsData.map(e => ({
            frontal_image_url: e.frontal,
            reference_image_urls: e.refs.length > 0 ? e.refs : undefined
        })).filter(e => e.frontal_image_url);
        
        if (elementsApiData.length > 0) payload.elements = elementsApiData;
        if (klingSceneData.length > 0) payload.scene_image_urls = klingSceneData;
        
        if (!payload.elements && !payload.scene_image_urls) {
            throw new Error('KLING O3 reqs at least 1 Element or Scene Ref');
        }
    } else {
        // Grok specifics
        if (grokRefData.length === 0) {
            throw new Error('GROK reqs at least 1 Reference Image (1-7)');
        }

        // Use reference_image_urls as shown in general API docs
        payload.reference_image_urls = grokRefData;
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

    log(`INITIATING_SEQUENCE for model: ${payload.model}`);
    queueStatus.innerText = "TRANSMITTING_DATA...";
    queueStatus.className = "blinking cyan";
    btnGenerate.disabled = true;
    
    try {
        log('Sending POST to API Queue Endpoint...');
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
            throw new Error(`API Handshake Failed: ${res.status} - ${errBody}`);
        }

        const data = await res.json();
        const queueId = data.queue_id || data.id; // Fallback to id just in case
        const responseModel = data.model || payload.model;
        log(`QUEUE ACCEPTED. ID: ${queueId}`, 'success');
        
        pollVideoResult(queueId, responseModel, key);

    } catch (err) {
        log(`API_ERR: ${err.message}`, 'error');
        queueStatus.innerText = "SYS_ERROR";
        queueStatus.className = "log-error";
        btnGenerate.disabled = false;
    }
});

async function pollVideoResult(queueId, model, apiKey) {
    queueStatus.innerText = "RENDERING_IN_PROGRESS...";
    let attempts = 0;
    const maxAttempts = 120; // 10 minutes total max?

    const poll = setInterval(async () => {
        attempts++;
        if (attempts > maxAttempts) {
            clearInterval(poll);
            log('POLLING TIMEOUT. MANUAL CHECK REQUIRED.', 'error');
            queueStatus.innerText = "TIMEOUT";
            btnGenerate.disabled = false;
            return;
        }

        try {
            log(`Polling retrieve... (${attempts}/${maxAttempts})`);
            const res = await fetch(API_POLL_URL, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}` 
                },
                body: JSON.stringify({ model, queue_id: queueId, delete_media_on_completion: true })
            });

            if (res.status === 404) return; // Wait
            if (!res.ok) {
                const errBody = await res.text();
                throw new Error(`Poll Error ${res.status}: ${errBody}`);
            }

            const contentType = res.headers.get("Content-Type") || "";

            if (contentType.includes("video/mp4")) {
                clearInterval(poll);
                const blob = await res.blob();
                const videoUrl = URL.createObjectURL(blob);
                
                log('RENDER COMPLETE! STREAM DETECTED.', 'success');
                queueStatus.innerText = "STREAM_ONLINE";
                queueStatus.className = "green";
                btnGenerate.disabled = false;

                outputContent.innerHTML = `
                    <video class="video-player" src="${videoUrl}" controls autoplay loop></video>
                `;
            } else {
                const data = await res.json();
                if (data.status === 'failed' || data.status === 'error') {
                    clearInterval(poll);
                    log(`RENDER FAILED ON SERVER: ${data.error || 'Unknown error'}`, 'error');
                    queueStatus.innerText = "RENDER_FAILED";
                    queueStatus.className = "log-error";
                    btnGenerate.disabled = false;
                }
            }
        } catch(e) {
            log(`POLL WARN: ${e.message}`, 'error');
            // Check if it's a 400 or other terminal error and abort if so
            if (e.message.includes("Poll Error 400") || e.message.includes("Poll Error 401") || e.message.includes("Poll Error 413") || e.message.includes("Poll Error 422")) {
                clearInterval(poll);
                queueStatus.innerText = "SYS_ERROR";
                queueStatus.className = "log-error";
                btnGenerate.disabled = false;
            }
        }
    }, 5000); // Poll every 5 seconds
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
log('VENICE REF-TO-VIDEO COMMAND SYSTEM INITIALIZED.');
log('==============================================');

// Local Storage for API key
const savedKey = localStorage.getItem('venice_api_key');
if (savedKey) {
    apiKeyInput.value = savedKey;
    log('RESTORED AUTH_TOKEN FROM LOCAL STORAGE.');
}

apiKeyInput.addEventListener('input', (e) => {
    localStorage.setItem('venice_api_key', e.target.value.trim());
});
