// Original, upbeat Web Audio organ music and cues. No remote files, media capture or shared game settings.
const STORAGE_KEY = 'business-island-audio-v1';
const MUSIC_VOLUME = .40;
const STEP_SECONDS = 60 / 126 / 2;
// Two answering four-bar phrases in C major; each entry is one eighth note.
const MELODY = [
  72, 76, 79, null, 76, 79, 81, 79,
  77, 81, 84, 81, 79, 76, 77, null,
  79, 83, 86, 83, 81, 79, 77, 74,
  76, 79, 84, 79, 76, 74, 72, null,
  79, 81, 84, 81, 79, 76, 74, 76,
  77, 81, 84, 81, 79, 77, 76, 72,
  74, 79, 83, 81, 79, 77, 74, 71,
  76, 79, 84, 76, 74, 72, 67, null
];
const CHORDS = [[60, 64, 67], [60, 65, 69], [59, 62, 67], [60, 64, 67]];
const BASS = [48, 53, 55, 48];
const LEAD_PARTIALS = [[1, 1], [2, .33], [3, .18], [4, .10]];
const CHORD_PARTIALS = [[1, 1], [2, .25]];
const BASS_PARTIALS = [[1, 1], [2, .18]];
const hz = midi => 440 * 2 ** ((midi - 69) / 12);

export function createIslandAudio({ isCurrent = () => true, onState = () => {} } = {}) {
  const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
  const doc = globalThis.document;
  let music = true, sound = true;
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) || 'null');
    if (typeof saved?.music === 'boolean') music = saved.music;
    if (typeof saved?.sound === 'boolean') sound = saved.sound;
  } catch { /* Storage can be unavailable inside a private or embedded browser. */ }
  let context = null, musicBus = null, soundBus = null, noiseBuffer = null;
  let active = true, destroyed = false, unlocked = false, blocked = false, resumeWhenVisible = false;
  let musicTimer = null, nextBeat = 0, beat = 0, epoch = 0, pendingResume = null, pendingEffect = '';
  let previousState = '';
  const voices = new Set(), lastCue = new Map();
  const current = () => { try { return !!isCurrent(); } catch { return false; } };
  const available = () => !destroyed && active && !doc?.hidden && current();
  function report() {
    const status = !Audio ? 'unsupported' : destroyed || !active || doc?.hidden || !current() ? 'paused'
      : !music && !sound ? 'muted' : blocked ? 'blocked' : !unlocked ? 'locked'
        : context?.state !== 'running' ? 'blocked' : music ? 'playing' : 'muted';
    const state = { music, sound, unlocked, status }, serialized = JSON.stringify(state);
    if (serialized !== previousState) {
      previousState = serialized;
      try { onState(state); } catch { /* Optional UI reporting cannot interrupt exploration. */ }
    }
  }
  function persist() {
    try { globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ music, sound })); } catch { /* Preferences remain usable in memory. */ }
  }
  function release(voice, stop = false) {
    if (!voices.delete(voice)) return;
    voice.source.onended = null;
    if (stop) { try { voice.source.stop(); } catch { /* The source may already have ended. */ } }
    for (const node of voice.nodes) { try { node.disconnect(); } catch { /* Already disconnected. */ } }
  }
  function clearVoices(group) {
    for (const voice of [...voices]) if (!group || voice.group === group) release(voice, true);
  }
  function remember(source, nodes, group) {
    const voice = { source, nodes, group };
    voices.add(voice); source.onended = () => release(voice);
  }
  function tone(group, frequency, at, duration, volume, type = 'sine', attack = .012, endFrequency = frequency) {
    const source = context.createOscillator(), envelope = context.createGain();
    source.type = type; source.frequency.setValueAtTime(frequency, at);
    if (endFrequency !== frequency) source.frequency.exponentialRampToValueAtTime(endFrequency, at + duration);
    envelope.gain.setValueAtTime(.0001, at);
    envelope.gain.linearRampToValueAtTime(volume, at + Math.min(attack, duration * .4));
    envelope.gain.exponentialRampToValueAtTime(.0001, at + duration);
    source.connect(envelope); envelope.connect(group === 'music' ? musicBus : soundBus);
    remember(source, [source, envelope], group); source.start(at); source.stop(at + duration + .025);
  }
  function organ(note, at, duration, volume, partials) {
    for (const [multiple, level] of partials) {
      const source = context.createOscillator(), envelope = context.createGain();
      source.type = 'sine'; source.frequency.setValueAtTime(hz(note) * multiple, at);
      envelope.gain.setValueAtTime(.0001, at);
      envelope.gain.linearRampToValueAtTime(volume * level, at + .006);
      envelope.gain.linearRampToValueAtTime(volume * level * .84, at + duration - .025);
      envelope.gain.linearRampToValueAtTime(.0001, at + duration);
      source.connect(envelope); envelope.connect(musicBus);
      remember(source, [source, envelope], 'music'); source.start(at); source.stop(at + duration + .015);
    }
  }
  function water(at, duration = .65, volume = .045) {
    if (!noiseBuffer) {
      noiseBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * .5), context.sampleRate);
      const pcm = noiseBuffer.getChannelData(0); let seed = 35291;
      for (let index = 0; index < pcm.length; index++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; pcm[index] = seed / 2147483648 - 1; }
    }
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), envelope = context.createGain();
    source.buffer = noiseBuffer; source.loop = true; filter.type = 'lowpass'; filter.frequency.value = 650; filter.Q.value = .45;
    envelope.gain.setValueAtTime(.0001, at); envelope.gain.linearRampToValueAtTime(volume, at + .07);
    envelope.gain.exponentialRampToValueAtTime(.0001, at + duration);
    source.connect(filter); filter.connect(envelope); envelope.connect(soundBus);
    remember(source, [source, filter, envelope], 'sound'); source.start(at); source.stop(at + duration + .025);
  }
  function stopMusic() {
    if (musicTimer !== null) clearTimeout(musicTimer);
    musicTimer = null; nextBeat = 0; beat = 0; clearVoices('music');
  }
  function stopAll() { stopMusic(); clearVoices(); pendingEffect = ''; lastCue.clear(); }
  function tick() {
    musicTimer = null;
    if (!available()) { pause(); return; }
    if (!music || !unlocked || context?.state !== 'running') { stopMusic(); report(); return; }
    try {
      const now = context.currentTime;
      if (!nextBeat || nextBeat < now - .2) nextBeat = now + .04;
      while (nextBeat < now + .45) {
        const note = MELODY[beat % MELODY.length];
        const bar = Math.floor(beat / 8) % CHORDS.length, step = beat % 8;
        if (note !== null) organ(note, nextBeat, MELODY[(beat + 1) % MELODY.length] === null ? .31 : .18, step === 0 || step === 4 ? .055 : .050, LEAD_PARTIALS);
        if (step % 2 === 0) organ(BASS[bar] + (step % 4 === 2 ? 7 : 0), nextBeat, .20, .036, BASS_PARTIALS);
        else for (const note of CHORDS[bar]) organ(note, nextBeat, .10, .0125, CHORD_PARTIALS);
        beat++; nextBeat += STEP_SECONDS;
      }
      musicTimer = setTimeout(tick, 80);
    } catch { blocked = true; stopAll(); report(); }
  }
  function startMusic() {
    if (musicTimer !== null || !music || !unlocked || !available() || context?.state !== 'running') return;
    tick();
  }
  function ready() {
    if (!available() || context?.state !== 'running') return false;
    unlocked = true; blocked = false; startMusic();
    const cue = pendingEffect; pendingEffect = '';
    if (cue) play(cue);
    report(); return true;
  }
  function startContext(gesture) {
    if (!Audio || !available() || (!music && !sound)) { report(); return Promise.resolve(false); }
    try {
      if (!context || context.state === 'closed') {
        if (!gesture) { report(); return Promise.resolve(false); }
        context = new Audio(); musicBus = context.createGain(); soundBus = context.createGain();
        musicBus.gain.value = music ? MUSIC_VOLUME : 0; soundBus.gain.value = sound ? .28 : 0;
        musicBus.connect(context.destination); soundBus.connect(context.destination);
        const created = context;
        context.onstatechange = () => {
          if (context !== created || destroyed) return;
          if (created.state === 'running' && unlocked && available()) startMusic();
          else if (created.state !== 'running') stopAll();
          report();
        };
      }
      if (context.state === 'running') { epoch++; pendingResume = null; return Promise.resolve(ready()); }
      if (pendingResume) return pendingResume;
      const expected = context, attempt = ++epoch;
      blocked = false;
      // This resume call executes in unlock()'s original click stack, before any await.
      const resumed = context.resume();
      pendingResume = Promise.resolve(resumed).then(() => {
        if (destroyed || context !== expected || attempt !== epoch) return false;
        pendingResume = null;
        if (ready()) return true;
        blocked = available(); stopAll(); report(); return false;
      }).catch(() => {
        if (!destroyed && context === expected && attempt === epoch) { pendingResume = null; blocked = true; stopAll(); report(); }
        return false;
      });
      report(); return pendingResume;
    } catch { pendingResume = null; blocked = true; stopAll(); report(); return Promise.resolve(false); }
  }
  function unlock() {
    if (destroyed) return Promise.resolve(false);
    active = true; return startContext(true);
  }
  function play(kind) {
    if (!['dice', 'depart', 'arrive'].includes(kind) || !sound || !available()) return false;
    if (!unlocked || context?.state !== 'running') { if (pendingResume && !blocked) pendingEffect = kind; return false; }
    try {
      const at = context.currentTime + .008;
      if (at - (lastCue.get(kind) ?? -Infinity) < .15) return false;
      lastCue.set(kind, at);
      if (kind === 'dice') {
        [0, .052, .113, .19, .28, .39].forEach((delay, index) => tone('sound', 390 - index * 23, at + delay, .055, .10 - index * .007, 'triangle', .002, 190 - index * 10));
      } else if (kind === 'depart') {
        tone('sound', hz(60), at, .8, .065, 'sine', .025);
        tone('sound', hz(67), at + .12, .8, .045, 'sine', .03); water(at + .05);
      } else [72, 76, 79].forEach((note, index) => tone('sound', hz(note), at + index * .075, .8, .055, 'sine', .02));
      return true;
    } catch { return false; }
  }
  function setMusicEnabled(enabled) {
    music = !!enabled; persist();
    if (musicBus) musicBus.gain.value = music ? MUSIC_VOLUME : 0;
    if (!music) stopMusic(); else if (unlocked && available()) void startContext(false);
    report();
  }
  function setSoundEnabled(enabled) {
    sound = !!enabled; persist();
    if (soundBus) soundBus.gain.value = sound ? .28 : 0;
    if (!sound) { clearVoices('sound'); pendingEffect = ''; }
    report();
  }
  function stopEffects() { clearVoices('sound'); pendingEffect = ''; lastCue.clear(); }
  function pause() {
    active = false; epoch++; pendingResume = null; stopAll();
    if (context && context.state !== 'closed') { try { void Promise.resolve(context.suspend()).catch(() => {}); } catch { /* Pausing is best effort on older WebViews. */ } }
    report();
  }
  function resume() {
    if (destroyed) return Promise.resolve(false);
    active = true;
    if (!unlocked) { report(); return Promise.resolve(false); }
    return startContext(false);
  }
  function visibility() {
    if (doc.hidden) { resumeWhenVisible = active; pause(); }
    else if (resumeWhenVisible) { resumeWhenVisible = false; void resume(); }
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true; active = false; unlocked = false; epoch++; pendingResume = null; stopAll();
    doc?.removeEventListener('visibilitychange', visibility);
    const old = context; context = null;
    if (old) { old.onstatechange = null; try { void Promise.resolve(old.close()).catch(() => {}); } catch { /* No optional sound failure reaches the game. */ } }
    for (const bus of [musicBus, soundBus]) { try { bus?.disconnect(); } catch { /* Already disconnected. */ } }
    musicBus = null; soundBus = null; noiseBuffer = null; report();
  }
  doc?.addEventListener('visibilitychange', visibility);
  report();
  return { get settings() { return { music, sound }; }, unlock, play, setMusicEnabled, setSoundEnabled, stopEffects, pause, resume, destroy };
}
