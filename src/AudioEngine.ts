export class AudioEngine {
    private ctx: AudioContext;
    private trackA: {
        buffer: AudioBuffer | null;
        gain: GainNode;
        panner: StereoPannerNode;
        source: AudioBufferSourceNode | null;
        vocalBoostNodes: AudioNode[];
        analyser: AnalyserNode;
        isPlaying: boolean;
        playStartTime: number;
        playStartOffset: number;
    };
    private trackB: {
        buffer: AudioBuffer | null;
        gain: GainNode;
        panner: StereoPannerNode;
        source: AudioBufferSourceNode | null;
        vocalBoostNodes: AudioNode[];
        analyser: AnalyserNode;
        isPlaying: boolean;
        playStartTime: number;
        playStartOffset: number;
    };
    private startTimeA: number = 0;
    private startTimeB: number = 0;
    private vocalBoostA: boolean = false;
    private vocalBoostB: boolean = false;
    private duckingEnabled: boolean = true;
    private stereoSplitEnabled: boolean = false;
    private duckingFrameId: number | null = null;
    private userVolumeB: number = 0.8;

    constructor() {
        this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

        // Initialize Track A
        const gainA = this.ctx.createGain();
        const pannerA = this.ctx.createStereoPanner();
        const analyserA = this.ctx.createAnalyser();
        analyserA.fftSize = 256;

        gainA.connect(pannerA);
        pannerA.connect(analyserA);
        analyserA.connect(this.ctx.destination);

        this.trackA = {
            buffer: null, gain: gainA, panner: pannerA, source: null, vocalBoostNodes: [], analyser: analyserA,
            isPlaying: false, playStartTime: 0, playStartOffset: 0
        };

        // Initialize Track B
        const gainB = this.ctx.createGain();
        const pannerB = this.ctx.createStereoPanner();
        const analyserB = this.ctx.createAnalyser();
        analyserB.fftSize = 256;

        gainB.connect(pannerB);
        pannerB.connect(analyserB);
        analyserB.connect(this.ctx.destination);

        this.trackB = {
            buffer: null, gain: gainB, panner: pannerB, source: null, vocalBoostNodes: [], analyser: analyserB,
            isPlaying: false, playStartTime: 0, playStartOffset: 0
        };
    }

    private async loadTrack(file: File): Promise<AudioBuffer> {
        const arrayBuffer = await file.arrayBuffer();
        return await this.ctx.decodeAudioData(arrayBuffer);
    }

    async loadTrackA(file: File): Promise<void> {
        this.trackA.buffer = await this.loadTrack(file);
    }

    async loadTrackB(file: File): Promise<void> {
        this.trackB.buffer = await this.loadTrack(file);
    }

    setVolumeA(value: number): void {
        const clampedValue = Math.max(0, Math.min(1, value));
        this.trackA.gain.gain.setValueAtTime(clampedValue, this.ctx.currentTime);
    }

    setVolumeB(value: number): void {
        this.userVolumeB = Math.max(0, Math.min(1, value));
        if (!this.duckingEnabled || !this.trackA.isPlaying) {
            this.trackB.gain.gain.setValueAtTime(this.userVolumeB, this.ctx.currentTime);
        }
    }

    setStartTimeA(value: number, seek: boolean = false): void {
        this.startTimeA = value;
        if (seek && this.trackA.isPlaying) {
            this.playTrackA();
        }
    }

    setStartTimeB(value: number, seek: boolean = false): void {
        this.startTimeB = value;
        if (seek && this.trackB.isPlaying) {
            this.playTrackB();
        }
    }

    setVocalBoostA(enabled: boolean): void {
        this.vocalBoostA = enabled;
        this.repatchTrack('A');
    }

    setVocalBoostB(enabled: boolean): void {
        this.vocalBoostB = enabled;
        this.repatchTrack('B');
    }

    setDucking(enabled: boolean): void {
        this.duckingEnabled = enabled;
        if (!enabled) {
            this.trackB.gain.gain.setTargetAtTime(this.userVolumeB, this.ctx.currentTime, 0.1);
        }
    }

    setStereoSplit(enabled: boolean): void {
        this.stereoSplitEnabled = enabled;
        const panA = this.stereoSplitEnabled ? -1 : 0;
        const panB = this.stereoSplitEnabled ? 1 : 0;
        this.trackA.panner.pan.setTargetAtTime(panA, this.ctx.currentTime, 0.1);
        this.trackB.panner.pan.setTargetAtTime(panB, this.ctx.currentTime, 0.1);
    }

    getDurationA(): number { return this.trackA.buffer?.duration || 0; }
    getDurationB(): number { return this.trackB.buffer?.duration || 0; }
    getAnalyserA() { return this.trackA.analyser; }
    getAnalyserB() { return this.trackB.analyser; }
    hasBufferA(): boolean { return !!this.trackA.buffer; }
    hasBufferB(): boolean { return !!this.trackB.buffer; }
    isPlayingA(): boolean { return this.trackA.isPlaying; }
    isPlayingB(): boolean { return this.trackB.isPlaying; }

    getCurrentProgA(): number {
        if (!this.trackA.isPlaying) return this.startTimeA;
        const elapsed = this.ctx.currentTime - this.trackA.playStartTime;
        const duration = this.trackA.buffer?.duration || 1;
        return (this.trackA.playStartOffset + elapsed) % duration;
    }

    getCurrentProgB(): number {
        if (!this.trackB.isPlaying) return this.startTimeB;
        const elapsed = this.ctx.currentTime - this.trackB.playStartTime;
        const duration = this.trackB.buffer?.duration || 1;
        return (this.trackB.playStartOffset + elapsed) % duration;
    }

    private repatchTrack(id: 'A' | 'B'): void {
        const track = id === 'A' ? this.trackA : this.trackB;
        if (!track.source) return;
        track.source.disconnect();
        track.vocalBoostNodes.forEach(node => node.disconnect());
        track.vocalBoostNodes = [];
        const isBoosted = id === 'A' ? this.vocalBoostA : this.vocalBoostB;
        if (isBoosted) {
            const chain = this.createVocalBoostChain();
            track.vocalBoostNodes = chain;
            track.source.connect(chain[0]); chain[0].connect(chain[1]); chain[1].connect(chain[2]); chain[2].connect(chain[3]); chain[3].connect(track.gain);
        } else {
            track.source.connect(track.gain);
        }
    }

    private createVocalBoostChain(): AudioNode[] {
        const hpf = this.ctx.createBiquadFilter(); hpf.type = "highpass"; hpf.frequency.value = 400;
        const lpf = this.ctx.createBiquadFilter(); lpf.type = "lowpass"; lpf.frequency.value = 8000;
        const peaking = this.ctx.createBiquadFilter(); peaking.type = "peaking"; peaking.frequency.value = 3000; peaking.gain.value = 18;
        const compressor = this.ctx.createDynamicsCompressor(); compressor.threshold.value = -30; compressor.ratio.value = 12;
        return [hpf, lpf, peaking, compressor];
    }

    private startDuckingMonitor() {
        if (this.duckingFrameId) return;
        const dataArray = new Uint8Array(this.trackA.analyser.fftSize);

        const monitor = () => {
            if (!this.trackA.isPlaying && !this.trackB.isPlaying) {
                this.duckingFrameId = null;
                return;
            }

            if (this.duckingEnabled && this.trackA.isPlaying && this.trackB.isPlaying) {
                this.trackA.analyser.getByteTimeDomainData(dataArray);
                let sumSquare = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    const normalized = (dataArray[i] - 128) / 128;
                    sumSquare += normalized * normalized;
                }
                const rms = Math.sqrt(sumSquare / dataArray.length);

                // If RMS > threshold, duck Track B
                const targetGain = rms > 0.05 ? this.userVolumeB * 0.4 : this.userVolumeB;
                this.trackB.gain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.15);
            }

            this.duckingFrameId = requestAnimationFrame(monitor);
        };
        this.duckingFrameId = requestAnimationFrame(monitor);
    }

    playTrackA(): void {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        this.stopTrackA();
        if (this.trackA.buffer) {
            this.trackA.source = this.ctx.createBufferSource();
            this.trackA.source.buffer = this.trackA.buffer;
            this.repatchTrack('A');
            this.trackA.source.start(0, this.startTimeA);
            this.trackA.isPlaying = true;
            this.trackA.playStartTime = this.ctx.currentTime;
            this.trackA.playStartOffset = this.startTimeA;
            this.startDuckingMonitor();
        }
    }

    playTrackB(): void {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        this.stopTrackB();
        if (this.trackB.buffer) {
            this.trackB.source = this.ctx.createBufferSource();
            this.trackB.source.buffer = this.trackB.buffer;
            this.repatchTrack('B');
            this.trackB.source.start(0, this.startTimeB);
            this.trackB.isPlaying = true;
            this.trackB.playStartTime = this.ctx.currentTime;
            this.trackB.playStartOffset = this.startTimeB;
            this.startDuckingMonitor();
        }
    }

    playBoth(): void {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        this.stop();
        const now = this.ctx.currentTime;
        if (this.trackA.buffer) {
            this.trackA.isPlaying = true; this.trackA.playStartTime = now; this.trackA.playStartOffset = this.startTimeA;
            this.trackA.source = this.ctx.createBufferSource(); this.trackA.source.buffer = this.trackA.buffer;
            this.repatchTrack('A'); this.trackA.source.start(now, this.startTimeA);
        }
        if (this.trackB.buffer) {
            this.trackB.isPlaying = true; this.trackB.playStartTime = now; this.trackB.playStartOffset = this.startTimeB;
            this.trackB.source = this.ctx.createBufferSource(); this.trackB.source.buffer = this.trackB.buffer;
            this.repatchTrack('B'); this.trackB.source.start(now, this.startTimeB);
        }
        this.startDuckingMonitor();
    }

    stopTrackA(): void {
        if (this.trackA.source) {
            try { this.trackA.source.stop(); } catch (e) { }
            this.trackA.source.disconnect();
            this.trackA.source = null;
        }
        this.trackA.isPlaying = false;
    }

    stopTrackB(): void {
        if (this.trackB.source) {
            try { this.trackB.source.stop(); } catch (e) { }
            this.trackB.source.disconnect();
            this.trackB.source = null;
        }
        this.trackB.isPlaying = false;
        // Reset gain to user volume on stop
        this.trackB.gain.gain.setValueAtTime(this.userVolumeB, this.ctx.currentTime);
    }

    stop(): void {
        this.stopTrackA();
        this.stopTrackB();
        if (this.duckingFrameId) {
            cancelAnimationFrame(this.duckingFrameId);
            this.duckingFrameId = null;
        }
    }
}
