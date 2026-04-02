// ============================================================
// VENICE API CONFIG
// ============================================================
const API_QUEUE_URL = "https://api.venice.ai/api/v1/video/queue";
const API_QUOTE_URL = "https://api.venice.ai/api/v1/video/quote";
const API_POLL_URL  = "https://api.venice.ai/api/v1/video/retrieve";

// ============================================================
// MODEL CONFIG
// ============================================================
const MODEL_CONFIG = {
    'grok-imagine-reference-to-video': {
        type: 'r2v',
        badge: 'R2V',
        label: 'Grok Imagine R2V',
        hint: 'Upload 1–7 reference images. Use <strong>@Image1</strong>, <strong>@Image2</strong> etc. in your prompt to tell the AI which images to reference.',
        uploadMode: 'grok',
        durations: ['5','8','10'],
        showResolution: true,
        showAudio: false,
    },
    'kling-o3-pro-reference-to-video': {
        type: 'r2v',
        badge: 'R2V',
        label: 'Kling O3 Pro R2V',
        hint: 'Add <strong>character elements</strong> (each needs a frontal face photo). Optionally upload scene images to set the environment and style.',
        uploadMode: 'kling',
        durations: ['5','8','10','15'],
        showResolution: false,
        showAudio: true,
    },
    'kling-o3-standard-reference-to-video': {
        type: 'r2v',
        badge: 'R2V',
        label: 'Kling O3 Standard R2V',
        hint: 'Add <strong>character elements</strong> (each needs a frontal face photo). Optionally upload scene images to set the environment and style.',
        uploadMode: 'kling',
        durations: ['5','8','10','15'],
        showResolution: false,
        showAudio: true,
    },
    'seedance-1-5-pro-image-to-video': {
        type: 'i2v',
        badge: 'I2V',
        label: 'Seedance 1.5 Pro',
        hint: 'Upload a <strong>Start Frame</strong> — the image your video begins from. Optionally add an <strong>End Frame</strong> to control where it ends. Describe the motion in your prompt.',
        uploadMode: 'seedance',
        durations: ['4','8','12'],
        showResolution: true,
        showAudio: false,
    },
    'wan-2.6-image-to-video': {
        type: 'i2v',
        badge: 'I2V',
        label: 'Wan 2.6',
        hint: 'Upload a <strong>Start Frame</strong> — the image the AI will animate. Describe what motion or action should happen in your prompt.',
        uploadMode: 'wan',
        durations: ['5','10','15'],
        showResolution: true,
        showAudio: false,
    },
};

// ============================================================
// DOM REFS
// ============================================================
const modelSelect       = document.getElementById('model-select');
const modelBadge        = document.getElementById('model-badge');
const modelHint         = document.getElementById('model-hint');
const uploadZone        = document.getElementById('upload-zone');
const promptInput       = document.getElementById('prompt-input');
const apiKeyInput       = document.getElementById('api-key');
const btnGenerate       = document.getElementById('btn-generate');
const btnQuote          = document.getElementById('btn-quote');
const btnClear          = document.getElementById('btn-clear');
const btnAddPrimary     = document.getElementById('btn-add-primary');
const btnSettingsToggle = document.getElementById('btn-settings-toggle');
const btnEnhancePrompt  = document.getElementById('btn-enhance-prompt');
const btnAddElement     = document.getElementById('btn-add-element');
const settingsPanel     = document.getElementById('settings-panel');
const klingElementsPanel= document.getElementById('kling-elements-panel');
const elementsContainer = document.getElementById('elements-container');
const elementTemplate   = document.getElementById('element-template');
const refTagsEl         = document.getElementById('ref-tags');
const logConsole        = document.getElementById('log-console');
const outputSection     = document.getElementById('output-section');
const outputContent     = document.getElementById('output-content');
const outputBadge       = document.getElementById('output-badge');
const queueStatus       = document.getElementById('queue-status');
const statusDot         = document.getElementById('status-dot');

// Settings inputs
const aspectRatio       = document.getElementById('aspect-ratio');
const duration          = document.getElementById('duration');
const resolutionToggle  = document.getElementById('resolution-toggle');
const audioToggle       = document.getElementById('audio-toggle');
const settingResolution = document.getElementById('setting-resolution');
const settingAudio      = document.getElementById('setting-audio');
const settingDuration   = document.getElementById('setting-duration');

// ============================================================
// STATE
// ============================================================
let grokRefData    = [];   // [url, url, ...] for Grok R2V
let i2vStartData   = null; // url for Seedance/Wan start frame
let i2vEndData     = null; // url for Seedance end frame
let elementsData   = [];   // [{id, frontal, refs:[]}] for Kling
let klingSceneData = [];   // [url, ...] for Kling scene
let elementCounter = 0;

// ============================================================
// UTILITIES
// ============================================================
function log(msg, type = 'info') {
    const p = document.createElement('p');
    p.innerText = `> ${msg}`;
    if (type === 'error')   p.className = 'log-error';
    if (type === 'success') p.className = 'log-success';
    logConsole.appendChild(p);
    logConsole.scrollTop = logConsole.scrollHeight;
}

function setStatus(text, state) {
    queueStatus.innerText = text;
    statusDot.className = 'status-dot' + (state === 'processing' ? ' processing' : state === 'error' ? ' error' : '');
    outputBadge.className = 'output-badge ' + state;
    outputBadge.innerText = text;
}

const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
});

function normalizeRefs(text) {
    return text
        .replace(/@image(\d+)/gi,   (_m, n) => `@Image${n}`)
        .replace(/@element(\d+)/gi, (_m, n) => `@Element${n}`);
}

// ============================================================
// IMGBB UPLOAD
// ============================================================
const IMGBB_API_KEY = 'd90955efed83e475e5d0b37cabb746fa';

async function uploadToImageHost(file) {
    if (!IMGBB_API_KEY || IMGBB_API_KEY === 'YOUR_IMGBB_API_KEY_HERE') {
        return await fileToBase64(file);
    }
    const formData = new FormData();
    formData.append('image', file);
    try {
        const res  = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: 'POST', body: formData });
        if (!res.ok) throw new Error(`Upload ${res.status}`);
        const data = await res.json();
        if (data.success && data.data?.url) return data.data.url;
        throw new Error('Bad ImgBB response');
    } catch (e) {
        log(`Upload failed: ${e.message}. Using base64.`, 'error');
        return await fileToBase64(file);
    }
}

// ============================================================
// MODEL SWITCH — rebuild upload zone + settings
// ============================================================
function currentModel() { return modelSelect.value; }
function currentConfig() { return MODEL_CONFIG[currentModel()]; }

function switchModel() {
    const cfg = currentConfig();

    // Badge
    modelBadge.innerText = cfg.badge;
    modelBadge.className = 'model-type-badge ' + (cfg.type === 'r2v' ? 'badge-r2v' : 'badge-i2v');

    // Hint
    modelHint.innerHTML = cfg.hint;

    // Duration options
    duration.innerHTML = cfg.durations.map(d => `<option value="${d}">${d} seconds</option>`).join('');

    // Settings toggles
    settingResolution.classList.toggle('hidden', !cfg.showResolution);
    settingAudio.classList.toggle('hidden', !cfg.showAudio);

    // Kling elements panel
    klingElementsPanel.classList.toggle('hidden', cfg.uploadMode !== 'kling');

    // Rebuild upload zone
    buildUploadZone(cfg.uploadMode);
}

modelSelect.addEventListener('change', switchModel);

// ============================================================
// UPLOAD ZONE BUILDER
// ============================================================
function buildUploadZone(mode) {
    uploadZone.innerHTML = '';

    if (mode === 'grok') {
        renderGrokSlots();
    } else if (mode === 'kling') {
        renderKlingSceneSlot();
    } else if (mode === 'seedance') {
        renderI2VSlot('start', 'Start Frame', 'Optional');
        renderI2VSlot('end',   'End Frame',   'Optional');
    } else if (mode === 'wan') {
        renderI2VSlot('start', 'Start Frame', 'Required');
    }
}

// ── GROK slots ──
function renderGrokSlots() {
    // Render existing uploaded images
    grokRefData.forEach((url, i) => {
        uploadZone.appendChild(makeGrokFilledSlot(url, i));
    });
    // Empty "add" slot if under limit
    if (grokRefData.length < 7) {
        const empty = makeGrokEmptySlot();
        uploadZone.appendChild(empty);
    }
    updateRefTags();
}

function makeGrokEmptySlot() {
    const slot = document.createElement('div');
    slot.className = 'upload-slot';
    slot.innerHTML = `
        <span class="slot-icon">+</span>
        <span class="slot-label">Reference</span>
        <input type="file" multiple accept="image/*" class="hidden-input" id="grok-file-input">
    `;
    const input = slot.querySelector('input');
    slot.addEventListener('click', (e) => { e.stopPropagation(); input.click(); });
    setupDrop(slot, input);
    input.addEventListener('change', handleGrokUpload);
    return slot;
}

function makeGrokFilledSlot(url, idx) {
    const slot = document.createElement('div');
    slot.className = 'upload-slot filled';
    slot.innerHTML = `
        <div class="slot-thumb" style="background-image:url(${url})"></div>
        <div class="slot-tag">@Image${idx + 1}</div>
        <button class="slot-remove" title="Remove">×</button>
    `;
    slot.querySelector('.slot-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        grokRefData.splice(idx, 1);
        renderGrokSlots();
        log(`Image removed. ${grokRefData.length} remaining.`);
    });
    return slot;
}

async function handleGrokUpload(e) {
    const files = Array.from(e.target.files);
    for (const file of files) {
        if (grokRefData.length >= 7) break;
        log(`Uploading image ${grokRefData.length + 1}...`);
        const url = await uploadToImageHost(file);
        grokRefData.push(url);
        log(`@Image${grokRefData.length} ready.`, 'success');
    }
    renderGrokSlots();
    e.target.value = '';
}

// ── KLING scene slot ──
function renderKlingSceneSlot() {
    // Scene images slot
    const sceneSlot = document.createElement('div');
    sceneSlot.className = 'upload-slot' + (klingSceneData.length ? ' filled' : '');

    if (klingSceneData.length > 0) {
        sceneSlot.innerHTML = `
            <div class="slot-thumb" style="background-image:url(${klingSceneData[0]})"></div>
            <div class="slot-tag">Scene ×${klingSceneData.length}</div>
            <button class="slot-remove" title="Clear scenes">×</button>
        `;
        sceneSlot.querySelector('.slot-remove').addEventListener('click', (e) => {
            e.stopPropagation();
            klingSceneData = [];
            renderKlingSceneSlot();
            log('Scene images cleared.');
        });
    } else {
        const sceneInput = document.createElement('input');
        sceneInput.type = 'file';
        sceneInput.multiple = true;
        sceneInput.accept = 'image/*';
        sceneInput.className = 'hidden-input';
        sceneSlot.innerHTML = `<span class="slot-icon">+</span><span class="slot-label">Scene Images</span>`;
        sceneSlot.appendChild(sceneInput);
        sceneSlot.addEventListener('click', (e) => { e.stopPropagation(); sceneInput.click(); });
        setupDrop(sceneSlot, sceneInput);
        sceneInput.addEventListener('change', async (ev) => {
            const files = Array.from(ev.target.files);
            for (const f of files) {
                if (klingSceneData.length >= 4) break;
                log('Uploading scene image...');
                const url = await uploadToImageHost(f);
                klingSceneData.push(url);
                log(`Scene image ${klingSceneData.length} ready.`, 'success');
            }
            renderKlingSceneSlot();
            ev.target.value = '';
        });
    }
    uploadZone.innerHTML = '';
    uploadZone.appendChild(sceneSlot);
}

// ── SEEDANCE / WAN I2V slots ──
function renderI2VSlot(type, label, sublabel) {
    const existing = type === 'start' ? i2vStartData : i2vEndData;
    const slot = document.createElement('div');
    slot.className = 'upload-slot' + (existing ? ' filled' : '');

    if (existing) {
        slot.innerHTML = `
            <div class="slot-thumb" style="background-image:url(${existing})"></div>
            <div class="slot-tag">${label}</div>
            <button class="slot-remove" title="Remove">×</button>
        `;
        slot.querySelector('.slot-remove').addEventListener('click', (e) => {
            e.stopPropagation();
            if (type === 'start') i2vStartData = null;
            else i2vEndData = null;
            buildUploadZone(currentConfig().uploadMode);
            log(`${label} removed.`);
        });
    } else {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.className = 'hidden-input';
        slot.innerHTML = `<span class="slot-icon">+</span><span class="slot-label">${label}<br><small style="opacity:0.6">${sublabel}</small></span>`;
        slot.appendChild(input);
        slot.addEventListener('click', (e) => { e.stopPropagation(); input.click(); });
        setupDrop(slot, input);
        input.addEventListener('change', async (ev) => {
            if (!ev.target.files?.length) return;
            log(`Uploading ${label}...`);
            const url = await uploadToImageHost(ev.target.files[0]);
            if (type === 'start') i2vStartData = url;
            else i2vEndData = url;
            log(`${label} ready.`, 'success');
            buildUploadZone(currentConfig().uploadMode);
            ev.target.value = '';
        });
    }
    uploadZone.appendChild(slot);
}

// ── Drag-and-drop helper ──
function setupDrop(zone, input) {
    zone.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', (e) => { e.preventDefault(); e.stopPropagation(); zone.classList.remove('drag-over'); });
    zone.addEventListener('drop', (e) => {
        e.preventDefault(); e.stopPropagation();
        zone.classList.remove('drag-over');
        if (e.dataTransfer.files.length) {
            input.files = e.dataTransfer.files;
            input.dispatchEvent(new Event('change', { bubbles: false }));
        }
    });
}

// ============================================================
// REF TAG CHIPS (Grok only)
// ============================================================
function updateRefTags() {
    refTagsEl.innerHTML = '';
    grokRefData.forEach((_, i) => {
        const btn = document.createElement('span');
        btn.className = 'ref-tag';
        btn.innerText = `@Image${i + 1}`;
        btn.addEventListener('click', () => {
            promptInput.focus();
            const tag = `@Image${i + 1} `;
            const sel = window.getSelection();
            if (sel?.rangeCount && promptInput.contains(sel.getRangeAt(0).commonAncestorContainer)) {
                const range = sel.getRangeAt(0);
                range.deleteContents();
                range.insertNode(document.createTextNode(tag));
                range.collapse(false);
            } else {
                promptInput.innerText += tag;
            }
        });
        refTagsEl.appendChild(btn);
    });
}

// ============================================================
// TOOLBAR BUTTONS
// ============================================================

// + button: context-sensitive add
btnAddPrimary.addEventListener('click', () => {
    const mode = currentConfig().uploadMode;
    if (mode === 'grok') {
        // Click the hidden grok file input
        const existing = uploadZone.querySelector('#grok-file-input');
        if (existing) existing.click();
    } else if (mode === 'kling') {
        // Add element
        btnAddElement.click();
    } else if (mode === 'seedance' || mode === 'wan') {
        // Click the start frame slot
        const startSlot = uploadZone.querySelector('.upload-slot:first-child input');
        if (startSlot) startSlot.click();
    }
});

// Settings toggle
btnSettingsToggle.addEventListener('click', () => {
    const open = !settingsPanel.classList.contains('hidden');
    settingsPanel.classList.toggle('hidden', open);
    btnSettingsToggle.classList.toggle('active', !open);
});

// ============================================================
// KLING ELEMENTS
// ============================================================
btnAddElement.addEventListener('click', () => {
    if (elementsData.length >= 4) { log('Max 4 elements.', 'error'); return; }
    elementCounter++;
    const id = Date.now().toString();
    elementsData.push({ id, frontal: null, refs: [] });

    const tpl  = elementTemplate.content.cloneNode(true);
    const card = tpl.querySelector('.element-card');
    card.dataset.id = id;
    card.innerHTML  = card.innerHTML.replace(/{num}/g, elementCounter).replace(/{id}/g, id);

    card.querySelector('.btn-remove-element').addEventListener('click', () => {
        card.remove();
        elementsData = elementsData.filter(e => e.id !== id);
        log(`Element removed.`);
    });

    // Frontal upload
    const frontalSlot  = card.querySelector('.frontal-box');
    const frontalInput = card.querySelector('.frontal-input');
    frontalSlot.addEventListener('click', () => frontalInput.click());
    frontalInput.addEventListener('change', async (e) => {
        if (!e.target.files?.length) return;
        const url = await fileToBase64(e.target.files[0]);
        const el  = elementsData.find(x => x.id === id);
        if (el) {
            el.frontal = url;
            frontalSlot.style.backgroundImage = `url(${url})`;
            frontalSlot.classList.add('has-image');
            frontalSlot.querySelector('.slot-icon-txt').style.display = 'none';
            log(`Frontal set for @Element${elementCounter}`);
        }
        e.target.value = '';
    });

    // Ref angles upload
    const refSlot  = card.querySelector('.ref-box');
    const refInput = card.querySelector('.element-ref-input');
    const refsRow  = card.querySelector('.element-refs-row');
    refSlot.addEventListener('click', () => refInput.click());
    refInput.addEventListener('change', async (e) => {
        const el = elementsData.find(x => x.id === id);
        if (!el || !e.target.files?.length) return;
        for (const file of Array.from(e.target.files)) {
            if (el.refs.length >= 3) break;
            const url = await fileToBase64(file);
            el.refs.push(url);
            const dot = document.createElement('div');
            dot.style.cssText = `width:24px;height:24px;border-radius:4px;background:url(${url}) center/cover;display:inline-block;margin:2px;border:1px solid rgba(255,255,255,0.1)`;
            refsRow.appendChild(dot);
        }
        log(`Ref angles updated.`);
        e.target.value = '';
    });

    elementsContainer.appendChild(card);
    log(`@Element${elementCounter} added.`);
});

// ============================================================
// PROMPT HIGHLIGHT ON BLUR
// ============================================================
promptInput.addEventListener('blur', () => {
    let text = promptInput.innerText;
    text = normalizeRefs(text);
    text = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    text = text.replace(/(@Image\d+|@Element\d+)/g, '<span class="ref-highlight">$1</span>');
    promptInput.innerHTML = text;
});

// ============================================================
// ENHANCE PROMPT
// ============================================================
btnEnhancePrompt.addEventListener('click', async () => {
    const key  = apiKeyInput.value.trim();
    const text = promptInput.innerText.trim();
    if (!key)  { log('Enter your API key first.', 'error'); return; }
    if (!text) { log('Write a prompt first.', 'error'); return; }

    log('Enhancing prompt...');
    btnEnhancePrompt.disabled = true;

    const cfg    = currentConfig();
    const isGrok = cfg.uploadMode === 'grok';
    const imageCount = isGrok ? grokRefData.length : 0;

    const systemPrompt = `You are an expert AI video prompt engineer specializing in ${cfg.label} generation.

Your job: enhance the user's prompt into a vivid, cinematic video description.

RULES:
${isGrok ? `- This is a Reference-to-Video model. The user has uploaded ${imageCount} reference image(s) tagged as @Image1${imageCount > 1 ? ', @Image2' : ''}${imageCount > 2 ? ', ...' : ''}.
- Preserve ALL @ImageX tags exactly as written — @Image1 not @image1.
- If the images contain people or faces, describe their appearance, expression, pose, movement, and interaction.` : ''}
${cfg.uploadMode === 'kling' ? `- This is a Kling element-based model. Preserve ALL @ElementX tags exactly.
- Describe how each character element interacts in the scene.` : ''}
${cfg.type === 'i2v' ? `- This is an image-to-video model. Focus on describing the motion, camera movement, and action that transforms the starting image into a dynamic video.` : ''}
- Add cinematic detail: camera movement (slow push-in, tracking shot, aerial pull-back, etc.), lighting (golden hour, neon-lit, soft diffused, dramatic rim light), mood, and atmosphere.
- Keep it under 150 words. Be vivid and specific.
- Output ONLY the enhanced prompt. No explanations, no preamble.`;

    try {
        const res = await fetch('https://api.venice.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify({
                model: 'mistral-small-2603',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user',   content: text }
                ]
            })
        });
        if (!res.ok) throw new Error(`Chat API ${res.status}`);
        const data = await res.json();
        let enhanced = data.choices[0].message.content;
        enhanced = normalizeRefs(enhanced);
        enhanced = enhanced.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        enhanced = enhanced.replace(/(@Image\d+|@Element\d+)/g, '<span class="ref-highlight">$1</span>');
        promptInput.innerHTML = enhanced;
        log('Prompt enhanced.', 'success');
    } catch (e) {
        log(`Enhance failed: ${e.message}`, 'error');
    } finally {
        btnEnhancePrompt.disabled = false;
    }
});

// ============================================================
// PAYLOAD BUILDER
// ============================================================
function buildPayload(isQuote = false) {
    const model = currentModel();
    const cfg   = currentConfig();
    const payload = { model };

    // Duration
    payload.duration     = `${duration.value}s`;
    payload.aspect_ratio = aspectRatio.value;

    if (cfg.showResolution) payload.resolution = resolutionToggle.value;
    if (cfg.showAudio)      payload.audio = audioToggle.value === 'true';

    if (isQuote) return payload;

    // Prompt
    let promptText = promptInput.innerText.trim();
    if (!promptText) throw new Error('Write a prompt describing your video.');
    promptText     = normalizeRefs(promptText);
    payload.prompt = promptText;

    // Per-model image fields
    if (cfg.uploadMode === 'grok') {
        if (grokRefData.length === 0) throw new Error('Upload at least 1 reference image.');
        // Both fields required by Venice production API
        payload.image_url            = grokRefData[0];
        payload.reference_image_urls = grokRefData;

    } else if (cfg.uploadMode === 'kling') {
        const elementsApiData = elementsData
            .map(e => ({
                frontal_image_url:    e.frontal,
                reference_image_urls: e.refs.length > 0 ? e.refs : undefined
            }))
            .filter(e => e.frontal_image_url);

        if (elementsApiData.length === 0 && klingSceneData.length === 0) {
            throw new Error('Add at least 1 character element or scene image.');
        }
        if (elementsApiData.length > 0)  payload.elements         = elementsApiData;
        if (klingSceneData.length > 0)   payload.scene_image_urls = klingSceneData;

    } else if (cfg.uploadMode === 'seedance') {
        if (!i2vStartData) throw new Error('Upload a Start Frame image.');
        payload.image_url = i2vStartData;
        if (i2vEndData)   payload.end_image_url = i2vEndData;

    } else if (cfg.uploadMode === 'wan') {
        if (!i2vStartData) throw new Error('Upload a Start Frame image.');
        payload.image_url = i2vStartData;
    }

    return payload;
}

// ============================================================
// ESTIMATE
// ============================================================
btnQuote.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    if (!key) { log('Enter your API key first.', 'error'); return; }
    log('Requesting estimate...');
    try {
        const res  = await fetch(API_QUOTE_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body:    JSON.stringify(buildPayload(true))
        });
        if (!res.ok) throw new Error(`Quote failed: ${res.status}`);
        const data = await res.json();
        log(`Estimate: $${data.quote} USD`, 'success');
        queueStatus.innerText = `$${data.quote}`;
    } catch (e) {
        log(e.message, 'error');
    }
});

// ============================================================
// GENERATE
// ============================================================
btnGenerate.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    if (!key) { log('Enter your API key first.', 'error'); return; }

    let payload;
    try { payload = buildPayload(); }
    catch (e) { log(e.message, 'error'); return; }

    log(`Queueing with ${payload.model}...`);
    setStatus('Queuing...', 'processing');
    outputSection.classList.remove('hidden');
    outputContent.innerHTML = '';
    btnGenerate.disabled = true;

    try {
        console.log('Payload:', JSON.stringify(payload, null, 2));
        const res = await fetch(API_QUEUE_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body:    JSON.stringify(payload)
        });
        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Queue ${res.status}: ${err}`);
        }
        const data   = await res.json();
        const queueId = data.id || data.queue_id;
        if (!queueId) throw new Error('No queue ID: ' + JSON.stringify(data));
        log(`Queued! ID: ${queueId}`, 'success');
        pollVideoResult(queueId, data.model || payload.model, key);
    } catch (e) {
        log(`Error: ${e.message}`, 'error');
        setStatus('Error', 'error');
        btnGenerate.disabled = false;
    }
});

// ============================================================
// POLLING
// ============================================================
async function pollVideoResult(queueId, model, apiKey) {
    setStatus('Rendering...', 'processing');
    let attempts = 0;
    const maxAttempts = 120;

    const poll = setInterval(async () => {
        attempts++;
        if (attempts > maxAttempts) {
            clearInterval(poll);
            log('Timeout after 10 minutes.', 'error');
            setStatus('Timeout', 'error');
            btnGenerate.disabled = false;
            return;
        }
        try {
            log(`Polling... (${attempts}/${maxAttempts})`);
            const res = await fetch(API_POLL_URL, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body:    JSON.stringify({ model, queue_id: queueId })
            });
            if (res.status === 404) return;
            if (!res.ok) {
                const err = await res.text();
                throw new Error(`Poll ${res.status}: ${err}`);
            }
            const ct = res.headers.get('Content-Type') || '';
            if (ct.includes('video/mp4')) {
                clearInterval(poll);
                const blob     = await res.blob();
                const videoUrl = URL.createObjectURL(blob);
                log('Video ready!', 'success');
                setStatus('Complete', 'complete');
                btnGenerate.disabled = false;
                outputContent.innerHTML = `
                    <video class="video-player" src="${videoUrl}" controls autoplay loop></video>
                    <a href="${videoUrl}" download="viv-imagine.mp4" class="btn-download">Download Video</a>
                `;
            } else {
                const data = await res.json();
                if (data.status === 'failed' || data.status === 'error') {
                    clearInterval(poll);
                    log(`Failed: ${data.error || JSON.stringify(data)}`, 'error');
                    setStatus('Failed', 'error');
                    btnGenerate.disabled = false;
                }
            }
        } catch (e) {
            log(`Poll warning: ${e.message}`, 'error');
            if (/Poll 40[012]/.test(e.message)) {
                clearInterval(poll);
                setStatus('Error', 'error');
                btnGenerate.disabled = false;
            }
        }
    }, 5000);
}

// ============================================================
// CLEAR ALL
// ============================================================
btnClear.addEventListener('click', () => {
    grokRefData    = [];
    klingSceneData = [];
    i2vStartData   = null;
    i2vEndData     = null;
    elementsData   = [];
    elementsContainer.innerHTML = '';
    promptInput.innerHTML = '';
    refTagsEl.innerHTML   = '';
    outputSection.classList.add('hidden');
    outputContent.innerHTML = '';
    setStatus('Ready', 'ready');
    buildUploadZone(currentConfig().uploadMode);
    log('Cleared.');
});

// ============================================================
// INIT
// ============================================================
log('Viv Imagine initialized.');
switchModel(); // build initial state

const savedKey = localStorage.getItem('venice_api_key');
if (savedKey) {
    apiKeyInput.value = savedKey;
    log('API key restored.');
}
apiKeyInput.addEventListener('input', (e) => {
    localStorage.setItem('venice_api_key', e.target.value.trim());
});
