// Web Audio API synthesized sound effects for POS hardware simulation

class SoundEffects {
  private ctx: AudioContext | null = null;

  private init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Play a realistic mechanical thermal receipt printer buzz/step & tear sound
  playPrinterSound() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      // 4 quick mechanical stepper motor clicks
      for (let i = 0; i < 4; i++) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220 + i * 40, now + i * 0.08);
        osc.frequency.exponentialRampToValueAtTime(120, now + i * 0.08 + 0.05);

        gain.gain.setValueAtTime(0.08, now + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.06);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.07);
      }

      // Paper tear "zip" sound at end
      const tearNoise = this.ctx.createOscillator();
      const tearGain = this.ctx.createGain();
      tearNoise.type = 'triangle';
      tearNoise.frequency.setValueAtTime(600, now + 0.38);
      tearNoise.frequency.exponentialRampToValueAtTime(80, now + 0.52);

      tearGain.gain.setValueAtTime(0.12, now + 0.38);
      tearGain.gain.exponentialRampToValueAtTime(0.001, now + 0.52);

      tearNoise.connect(tearGain);
      tearGain.connect(this.ctx.destination);
      tearNoise.start(now + 0.38);
      tearNoise.stop(now + 0.53);
    } catch {
      // Audio context might be restricted before user gesture
    }
  }

  // Kitchen / Order Confirmation Bell ("Ting!")
  playBellSound() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1760, now); // A6 note
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.8);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.85);
    } catch {
      // Ignore audio error
    }
  }

  // Soft touch screen tap sound
  playTapSound() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.04);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.045);
    } catch {
      // Ignore
    }
  }

  // Cash Register / Settlement success chime
  playCashRegisterSound() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      [1046.5, 1318.5, 1567.98, 2093].forEach((freq, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.07);

        gain.gain.setValueAtTime(0.12, now + idx * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.25);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + idx * 0.07);
        osc.stop(now + idx * 0.07 + 0.26);
      });
    } catch {
      // Ignore
    }
  }
}

export const sounds = new SoundEffects();
