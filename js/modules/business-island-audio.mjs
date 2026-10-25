// Original, quiet Web Audio music and cues. No remote files, media capture or shared game settings.
const STORAGE_KEY = 'business-island-audio-v1';
const MELODY = [60, null, 64, 67, 69, null, 67, 64, 62, null, 64, 67, 72, 69, 67, null];
const CHORDS = [[48, 55, 64], [45, 52, 60], [43, 50, 59], [48, 55, 62]];
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
      while (nextBeat < now + .8) {
        const note = MELODY[beat % MELODY.length];
        if (note !== null) {
          tone('music', hz(note), nextBeat, 1.65, .075);
          tone('music', hz(note) * 2, nextBeat + .003, .8, .009);
        }
        if (beat % 8 === 0) for (const note of CHORDS[Math.floor(beat / 8) % CHORDS.length]) tone('music', hz(note), nextBeat, 5.8, .022, 'sine', .9);
        beat++; nextBeat += .8;
      }
      musicTimer = setTimeout(tick, 180);
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
        musicBus.gain.value = music ? .18 : 0; soundBus.gain.value = sound ? .28 : 0;
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
    if (musicBus) musicBus.gain.value = music ? .18 : 0;
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
