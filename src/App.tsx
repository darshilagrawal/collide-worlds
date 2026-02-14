import { useRef, useState, useEffect } from 'react';
import { AudioEngine } from './AudioEngine';
import './index.css';

const Visualizer = ({ analyser, color, isPlaying }: { analyser: AnalyserNode | null, color: string, isPlaying: boolean }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const idleFrame = useRef(0);

  useEffect(() => {
    if (!analyser || !canvasRef.current) return;
    const canvas = canvasRef.current;

    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth * window.devicePixelRatio;
        canvas.height = parent.clientHeight * window.devicePixelRatio;
      }
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      requestAnimationFrame(draw);

      if (isPlaying) {
        analyser.getByteFrequencyData(dataArray);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const barWidth = (canvas.width / bufferLength) * 1.5;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * canvas.height;
          const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
          gradient.addColorStop(0, color);
          gradient.addColorStop(1, '#ffffff');
          ctx.fillStyle = gradient;
          ctx.globalAlpha = 0.8;
          ctx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);
          x += barWidth;
        }
      } else {
        // --- IDLE STATE VISUAL ---
        idleFrame.current += 0.02;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;

        // Dynamic Pulsing Orb
        ctx.beginPath();
        const pulse = Math.sin(idleFrame.current) * 10 + 40;
        const grad = ctx.createRadialGradient(centerX, centerY, 5, centerX, centerY, pulse);
        grad.addColorStop(0, color);
        grad.addColorStop(1, 'transparent');

        ctx.fillStyle = grad;
        ctx.globalAlpha = 0.4 + (Math.sin(idleFrame.current * 2) * 0.1);
        ctx.arc(centerX, centerY, pulse, 0, Math.PI * 2);
        ctx.fill();

        // "READY" Text in futuristic styling
        ctx.font = `800 ${Math.floor(canvas.height * 0.12)}px 'Plus Jakarta Sans'`;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.letterSpacing = '10px';
        ctx.globalAlpha = 0.1 + (Math.abs(Math.sin(idleFrame.current)));
        ctx.fillText("READY", centerX, centerY + (canvas.height * 0.04));

        // Scanning line
        const scanY = (Math.sin(idleFrame.current * 0.5) + 1) / 2 * canvas.height;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.2;
        ctx.beginPath();
        ctx.moveTo(0, scanY);
        ctx.lineTo(canvas.width, scanY);
        ctx.stroke();
      }
    };

    draw();
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [analyser, color, isPlaying]);

  return (
    <div className="vis-container">
      <canvas ref={canvasRef} className="vis-canvas" />
    </div>
  );
};

function App() {
  const engine = useRef<AudioEngine | null>(null);
  const fileInputARef = useRef<HTMLInputElement>(null);
  const fileInputBRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [volA, setVolA] = useState(0.8);
  const [volB, setVolB] = useState(0.8);
  const [progressA, setProgressA] = useState(0);
  const [progressB, setProgressB] = useState(0);
  const [durationA, setDurationA] = useState(0);
  const [durationB, setDurationB] = useState(0);
  const [boostA, setBoostA] = useState(false);
  const [boostB, setBoostB] = useState(false);
  const [trackAName, setTrackAName] = useState<string>('');
  const [trackBName, setTrackBName] = useState<string>('');
  const [boostPanelOpen, setBoostPanelOpen] = useState(false);
  const [isMasterPlaying, setIsMasterPlaying] = useState(false);
  const [hasBufferA, setHasBufferA] = useState(false);
  const [hasBufferB, setHasBufferB] = useState(false);
  const [duckingMode, setDuckingMode] = useState(true);
  const [stereoSplit, setStereoSplit] = useState(true);
  const [showToast, setShowToast] = useState(false);

  const [isDeckAPlaying, setIsDeckAPlaying] = useState(false);
  const [isDeckBPlaying, setIsDeckBPlaying] = useState(false);

  useEffect(() => {
    if (!engine.current) {
      engine.current = new AudioEngine();
      // Set default engine states
      engine.current.setStereoSplit(true);
    }

    const params = new URLSearchParams(window.location.search);
    const tA = params.get('trackA');
    const tB = params.get('trackB');
    if (tA || tB) {
      if (tA) setTrackAName(tA);
      if (tB) setTrackBName(tB);
      const vA = params.get('volA'); if (vA) { const v = parseFloat(vA); setVolA(v); engine.current.setVolumeA(v); }
      const vB = params.get('volB'); if (vB) { const v = parseFloat(vB); setVolB(v); engine.current.setVolumeB(v); }
      const bA = params.get('boostA'); if (bA === 'true') { setBoostA(true); engine.current.setVocalBoostA(true); }
      const bB = params.get('boostB'); if (bB === 'true') { setBoostB(true); engine.current.setVocalBoostB(true); }
      const sA = params.get('startA'); if (sA) { const s = parseFloat(sA); setProgressA(s); engine.current.setStartTimeA(s); }
      const sB = params.get('startB'); if (sB) { const s = parseFloat(sB); setProgressB(s); engine.current.setStartTimeB(s); }
      const dck = params.get('ducking'); if (dck !== null) { const isD = dck === 'true'; setDuckingMode(isD); engine.current.setDucking(isD); }
      const st = params.get('stereo'); if (st !== null) { const isS = st === 'true'; setStereoSplit(isS); engine.current.setStereoSplit(isS); }
      setStep(2);
    }

    let frameId: number;
    const updateScrubbers = () => {
      if (engine.current) {
        setProgressA(engine.current.getCurrentProgA());
        setProgressB(engine.current.getCurrentProgB());
        setHasBufferA(engine.current.hasBufferA());
        setHasBufferB(engine.current.hasBufferB());
        setIsDeckAPlaying(engine.current.isPlayingA());
        setIsDeckBPlaying(engine.current.isPlayingB());
      }
      frameId = requestAnimationFrame(updateScrubbers);
    };
    updateScrubbers();
    return () => cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    if (step === 2 && engine.current && hasBufferA && hasBufferB && !isMasterPlaying) {
      engine.current.playBoth();
      setIsMasterPlaying(true);
    }
  }, [step, hasBufferA, hasBufferB]);

  const handleFileA = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && engine.current) {
      setTrackAName(file.name);
      await engine.current.loadTrackA(file);
      setDurationA(engine.current.getDurationA());
      setHasBufferA(true);
    }
  };

  const handleFileB = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && engine.current) {
      setTrackBName(file.name);
      await engine.current.loadTrackB(file);
      setDurationB(engine.current.getDurationB());
      setHasBufferB(true);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const toggleGlobalBoost = () => {
    const newState = !(boostA && boostB);
    setBoostA(newState); setBoostB(newState);
    engine.current?.setVocalBoostA(newState); engine.current?.setVocalBoostB(newState);
  };

  const handleMasterAction = () => {
    if (isMasterPlaying) { engine.current?.stop(); setIsMasterPlaying(false); }
    else { engine.current?.playBoth(); setIsMasterPlaying(true); }
  };

  const handleShare = () => {
    const params = new URLSearchParams({
      trackA: trackAName, trackB: trackBName, volA: volA.toString(), volB: volB.toString(),
      boostA: boostA.toString(), boostB: boostB.toString(), ducking: duckingMode.toString(),
      stereo: stereoSplit.toString(), startA: progressA.toFixed(2), startB: progressB.toFixed(2)
    });
    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    navigator.clipboard.writeText(url);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  if (step === 1) {
    return (
      <div className="container step-one">
        <h1 className="logo-text">COLLISION</h1>
        <p style={{ color: 'var(--text-dim)', marginBottom: '2.5rem', fontSize: '0.8rem', fontWeight: 800, letterSpacing: '0.1em' }}>SELECT YOUR SOUNDS</p>
        <input type="file" ref={fileInputARef} accept="audio/*" onChange={handleFileA} style={{ display: 'none' }} />
        <div className={`upload-card ${trackAName ? 'filled' : ''}`} onClick={() => fileInputARef.current?.click()}>
          <span className="upload-num">01. PRIMARY TRACK</span>
          <span className="upload-status">{trackAName || 'TAP TO SELECT AUDIO'}</span>
        </div>
        <input type="file" ref={fileInputBRef} accept="audio/*" onChange={handleFileB} style={{ display: 'none' }} />
        <div className={`upload-card ${trackBName ? 'filled' : ''}`} onClick={() => fileInputBRef.current?.click()}>
          <span className="upload-num">02. SECONDARY TRACK</span>
          <span className="upload-status">{trackBName || 'TAP TO SELECT AUDIO'}</span>
        </div>
        {trackAName && trackBName && (
          <button className="btn-start-collision" onClick={() => setStep(2)}>COLLIDE WORLDS</button>
        )}
      </div>
    );
  }

  return (
    <div className="container step-two">
      <div className="top-controls-bar">
        <div className={`boost-pill-v4 ${boostPanelOpen ? 'open' : ''}`}>
          <div className="boost-drop-v4">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="static-label">TRACK A</label>
              <button className={`btn-deck ${boostA ? 'btn-deck-play' : 'btn-deck-stop'}`} style={{ width: '60px', padding: '0.4rem' }}
                onClick={(e) => { e.stopPropagation(); setBoostA(!boostA); engine.current?.setVocalBoostA(!boostA); }}> {boostA ? 'ON' : 'OFF'} </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="static-label">TRACK B</label>
              <button className={`btn-deck ${boostB ? 'btn-deck-play' : 'btn-deck-stop'}`} style={{ width: '60px', padding: '0.4rem' }}
                onClick={(e) => { e.stopPropagation(); setBoostB(!boostB); engine.current?.setVocalBoostB(!boostB); }}> {boostB ? 'ON' : 'OFF'} </button>
            </div>
          </div>
          <button className={`boost-btn-v4 ${boostA && boostB ? 'active' : ''}`} onClick={toggleGlobalBoost}>BOOST</button>
          <button className="boost-rev-v4" onClick={() => setBoostPanelOpen(!boostPanelOpen)}>{boostPanelOpen ? '▼' : '▲'}</button>
        </div>
        <div className={`ducking-toggle-container ${duckingMode ? 'active' : ''}`}
          onClick={() => { setDuckingMode(!duckingMode); engine.current?.setDucking(!duckingMode); }}>
          <span className="ducking-icon">🦆</span>
          <span className="ducking-label">{duckingMode ? 'SMART DUCKING' : 'DUCKING OFF'}</span>
        </div>
      </div>

      <div className="jukebox-grid">
        <div className="jukebox">
          {!hasBufferA && (
            <div className="deck-upload-overlay" onClick={() => fileInputARef.current?.click()}>
              <span className="deck-upload-icon">↑</span>
              <span className="deck-upload-text">UPLOAD TRACK A:</span>
              <span className="deck-upload-target">{trackAName}</span>
              <span className="deck-upload-hint">TAP TO COMPLETE THE COLLISION</span>
              <input type="file" ref={fileInputARef} accept="audio/*" onChange={handleFileA} style={{ display: 'none' }} />
            </div>
          )}
          <div className="jukebox-header">
            <label className="juke-label">DECK A</label>
            <span className="value-time">{formatTime(progressA)}</span>
          </div>
          <div className="track-title">{trackAName}</div>
          <Visualizer analyser={engine.current?.getAnalyserA() || null} color="#ff0055" isPlaying={isDeckAPlaying} />
          <div className="scrubber-wrap">
            <input type="range" min="0" max={durationA || 100} step="0.1" value={progressA}
              onChange={(e) => { const s = parseFloat(e.target.value); setProgressA(s); engine.current?.setStartTimeA(s, true); }} />
          </div>
          <div className="control-block">
            <div className="label-strip"><span className="static-label">VOLUME</span><span className="dynamic-value">{Math.round(volA * 100)}</span></div>
            <input type="range" min="0" max="1" step="0.01" value={volA}
              onChange={(e) => { const v = parseFloat(e.target.value); setVolA(v); engine.current?.setVolumeA(v); }} />
          </div>
          <div className="deck-controls">
            <button className="btn-deck btn-deck-play" onClick={() => { engine.current?.playTrackA(); setIsMasterPlaying(false); }}>PLAY A</button>
            <button className="btn-deck btn-deck-stop" onClick={() => { engine.current?.stopTrackA(); setIsMasterPlaying(false); }}>STOP</button>
          </div>
        </div>

        <div className="jukebox">
          {!hasBufferB && (
            <div className="deck-upload-overlay" onClick={() => fileInputBRef.current?.click()}>
              <span className="deck-upload-icon">↑</span>
              <span className="deck-upload-text">UPLOAD TRACK B:</span>
              <span className="deck-upload-target">{trackBName}</span>
              <span className="deck-upload-hint">TAP TO COMPLETE THE COLLISION</span>
              <input type="file" ref={fileInputBRef} accept="audio/*" onChange={handleFileB} style={{ display: 'none' }} />
            </div>
          )}
          <div className="jukebox-header">
            <label className="juke-label">DECK B</label>
            <span className="value-time">{formatTime(progressB)}</span>
          </div>
          <div className="track-title">{trackBName}</div>
          <Visualizer analyser={engine.current?.getAnalyserB() || null} color="#00f2ff" isPlaying={isDeckBPlaying} />
          <div className="scrubber-wrap">
            <input type="range" min="0" max={durationB || 100} step="0.1" value={progressB}
              onChange={(e) => { const s = parseFloat(e.target.value); setProgressB(s); engine.current?.setStartTimeB(s, true); }} />
          </div>
          <div className="control-block">
            <div className="label-strip"><span className="static-label">VOLUME</span><span className="dynamic-value">{Math.round(volB * 100)}</span></div>
            <input type="range" min="0" max="1" step="0.01" value={volB}
              onChange={(e) => { const v = parseFloat(e.target.value); setVolB(v); engine.current?.setVolumeB(v); }} />
          </div>
          <div className="deck-controls">
            <button className="btn-deck btn-deck-play" onClick={() => { engine.current?.playTrackB(); setIsMasterPlaying(false); }}>PLAY B</button>
            <button className="btn-deck btn-deck-stop" onClick={() => { engine.current?.stopTrackB(); setIsMasterPlaying(false); }}>STOP</button>
          </div>
        </div>
      </div>

      <div className="master-unified">
        <div className="master-row">
          <button className={`btn-master-main ${isMasterPlaying ? 'playing' : ''}`} onClick={handleMasterAction}>
            {isMasterPlaying ? '❙ ❙' : '▶'}
          </button>
          <div className={`stereo-toggle-container ${stereoSplit ? 'active' : ''}`}
            onClick={() => { setStereoSplit(!stereoSplit); engine.current?.setStereoSplit(!stereoSplit); }}>
            <span className="stereo-icon">🎧</span>
            <span className="stereo-label">{stereoSplit ? 'STEREO SPLIT ACTIVE' : 'CENTERED STEREO'}</span>
          </div>
        </div>
        <button className="btn-share-v2" onClick={handleShare}>SHARE YOUR COLLISION</button>
        <button className="btn-back-link" onClick={() => { engine.current?.stop(); setStep(1); }}>RE-UPLOAD TRACKS</button>
      </div>

      <div className={`toast-container ${showToast ? 'active' : ''}`}>
        <div className="toast-icon">✓</div>
        COLLISION LINK COPIED
      </div>
    </div>
  );
}

export default App;
