import React, { useState, useEffect, useRef } from 'react';
import { Upload, Play, Square, Repeat, Download, Wand2, Music, Info, Loader2, AlertCircle, FileAudio, Trash2, Menu, Archive, Settings, Key, X } from 'lucide-react';
import JSZip from 'jszip';
import WaveformEditor from './components/WaveformEditor';
import { detectLoopPoints } from './services/audioDsp';
import { exportWavWithSmpl } from './services/wavWriter';
import { generateSmartFilename, hasApiKey, setApiKey, getApiKey, clearApiKey } from './services/groqService';
import { AudioFileMetadata, LoopPoint, BatchItem } from './types';

// Audio Context Singleton
let audioCtx: AudioContext | null = null;

function App() {
  // Batch State
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Active Editor State (Derived from loading activeItemId)
  const [activeBuffer, setActiveBuffer] = useState<AudioBuffer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [isLooping, setIsLooping] = useState(true);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Settings Modal State
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [hasKey, setHasKey] = useState(false);

  // Check for API key on mount
  useEffect(() => {
    setHasKey(hasApiKey());
  }, []);

  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derived active item
  const activeItem = batchItems.find(i => i.id === activeItemId);
  const activeLoop = activeItem && activeItem.loopPoints ? activeItem.loopPoints.find(lp => lp.id === activeItem.selectedLoopId) : null;

  // --- Audio Engine Helpers ---

  const initAudioContext = async () => {
      if (!audioCtx) {
          const CtxClass = window.AudioContext || (window as any).webkitAudioContext;
          audioCtx = new CtxClass();
      }
      if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
      }
      return audioCtx;
  };

  const decodeFile = async (file: File): Promise<AudioBuffer> => {
      const ctx = await initAudioContext();
      const arrayBuffer = await file.arrayBuffer();
      return new Promise((resolve, reject) => {
          ctx.decodeAudioData(
              arrayBuffer,
              (buf) => resolve(buf),
              (err) => reject(new Error(`Falha ao decodificar ${file.name}`))
          );
      });
  };

  // --- Event Handlers ---

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Initialize Audio Context immediately on user interaction
    try {
        await initAudioContext();
    } catch (err) {
        console.error("Audio Context Init Failed", err);
        setErrorMsg("Erro ao iniciar áudio. Toque na tela e tente novamente.");
        return;
    }

    setIsLoading(true);

    const newItems: BatchItem[] = (Array.from(files) as File[]).map(file => ({
        id: Math.random().toString(36).substr(2, 9),
        file: file,
        status: 'pending',
        loopPoints: [],
        selectedLoopId: null,
        smartName: file.name.replace(/\.[^/.]+$/, "") // remove extension for smart name base
    }));

    setBatchItems(prev => [...prev, ...newItems]);
    
    // If no item is active, activate the first new one
    if (!activeItemId && newItems.length > 0) {
        loadItemForEditing(newItems[0].id, newItems[0]);
    } else {
        setIsLoading(false);
    }

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const loadItemForEditing = async (id: string, itemOverride?: BatchItem) => {
      stopPlayback();
      setIsLoading(true);
      setErrorMsg(null);
      setActiveBuffer(null); // Clear current visualization
      setActiveItemId(id);

      const item = itemOverride || batchItems.find(i => i.id === id);
      if (!item) return;

      try {
          const buffer = await decodeFile(item.file);
          setActiveBuffer(buffer);
          
          // If this item hasn't been processed for loops yet, do it now
          if (item.status === 'pending' || item.loopPoints.length === 0) {
              let points: LoopPoint[] = [];
              if (buffer.duration > 0.5) {
                  points = detectLoopPoints(buffer);
              } else {
                   points = [{ id: 1, start: 0, end: buffer.length - 1, score: 100, name: "Short Loop" }];
              }

              // Update item state
              setBatchItems(prev => prev.map(i => i.id === id ? {
                  ...i,
                  status: 'processed',
                  loopPoints: points,
                  selectedLoopId: points.length > 0 ? points[0].id : null,
                  duration: buffer.duration
              } : i));
          }
      } catch (err) {
          console.error(err);
          setErrorMsg(`Erro ao carregar ${item.file.name}`);
          setBatchItems(prev => prev.map(i => i.id === id ? { ...i, status: 'error' } : i));
      } finally {
          setIsLoading(false);
      }
  };

  const handleRemoveItem = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      setBatchItems(prev => prev.filter(i => i.id !== id));
      if (activeItemId === id) {
          stopPlayback();
          setActiveBuffer(null);
          setActiveItemId(null);
      }
  };

  // --- Playback Controls ---

  const stopPlayback = () => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
      } catch (e) {}
      sourceNodeRef.current = null;
    }
    cancelAnimationFrame(animationFrameRef.current);
    setIsPlaying(false);
    pausedTimeRef.current = 0;
    setPlaybackTime(0);
  };

  const togglePlayback = async () => {
    if (isPlaying) {
      stopPlayback();
    } else {
      if (!audioCtx || !activeBuffer || !activeLoop) return;
      
      if (audioCtx.state === 'suspended') await audioCtx.resume();

      const source = audioCtx.createBufferSource();
      source.buffer = activeBuffer;
      source.loop = isLooping;
      source.loopStart = activeLoop.start / activeBuffer.sampleRate;
      source.loopEnd = activeLoop.end / activeBuffer.sampleRate;

      source.connect(audioCtx.destination);
      source.start(0, pausedTimeRef.current);
      
      startTimeRef.current = audioCtx.currentTime - pausedTimeRef.current;
      sourceNodeRef.current = source;
      setIsPlaying(true);

      const updateTime = () => {
        if (!audioCtx || !sourceNodeRef.current) return;
        
        let time = audioCtx.currentTime - startTimeRef.current;
        
        if (isLooping && activeLoop) {
            const duration = (activeLoop.end - activeLoop.start) / activeBuffer.sampleRate;
            const start = activeLoop.start / activeBuffer.sampleRate;
            if (time > start) {
                const offset = (time - start) % duration;
                time = start + offset;
            }
        } else if (time > activeBuffer.duration) {
             stopPlayback();
             return;
        }

        setPlaybackTime(time);
        animationFrameRef.current = requestAnimationFrame(updateTime);
      };
      updateTime();
    }
  };

  const handleSeek = (time: number) => {
      stopPlayback();
      pausedTimeRef.current = time;
      setPlaybackTime(time);
  };

  // --- Modification Handlers ---

  const updateActiveLoop = (newLoop: LoopPoint) => {
      if (!activeItemId) return;
      
      setBatchItems(prev => prev.map(item => {
          if (item.id === activeItemId) {
              const newPoints = item.loopPoints.map(lp => lp.id === newLoop.id ? newLoop : lp);
              return { ...item, loopPoints: newPoints };
          }
          return item;
      }));

      // Restart playback if dragging ended (optional, currently just stops to avoid glitches)
     // if (isPlaying) stopPlayback();
  };

  const selectLoopId = (loopId: number) => {
      if (!activeItemId) return;
      stopPlayback();
      setBatchItems(prev => prev.map(item => 
          item.id === activeItemId ? { ...item, selectedLoopId: loopId } : item
      ));
  };

  const handleSmartRename = async () => {
      if (!activeItem || !activeBuffer) return;
      if (!hasKey) {
          setShowSettings(true);
          return;
      }
      setIsRenaming(true);
      try {
          const newName = await generateSmartFilename(activeItem.file.name, activeBuffer.duration, activeItem.loopPoints.length);
          setBatchItems(prev => prev.map(item =>
            item.id === activeItemId ? { ...item, smartName: newName.replace('.wav', '') } : item
          ));
      } catch (e: any) {
          setErrorMsg(e.message || 'Erro ao gerar nome');
      }
      setIsRenaming(false);
  };

  const handleSaveApiKey = () => {
      if (apiKeyInput.trim().length > 10) {
          setApiKey(apiKeyInput.trim());
          setHasKey(true);
          setShowSettings(false);
          setApiKeyInput('');
      }
  };

  const handleClearApiKey = () => {
      clearApiKey();
      setHasKey(false);
      setApiKeyInput('');
  };

  const handleNameChange = (val: string) => {
    if (!activeItemId) return;
    setBatchItems(prev => prev.map(item => 
        item.id === activeItemId ? { ...item, smartName: val } : item
    ));
  };

  // --- Export Logic ---

  const exportSingle = () => {
      if (!activeBuffer || !activeLoop || !activeItem) return;
      const blob = exportWavWithSmpl(activeBuffer, activeLoop);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeItem.smartName}.wav`;
      a.click();
      URL.revokeObjectURL(url);
  };

  const exportBatchZip = async () => {
      if (batchItems.length === 0) return;
      
      setIsExportingZip(true);
      setExportProgress(0);
      stopPlayback();

      const zip = new JSZip();
      let processedCount = 0;

      try {
          for (const item of batchItems) {
              let bufferToProcess: AudioBuffer;
              let loopToProcess: LoopPoint | null = null;

              // If this is the currently active item, we have the buffer in memory
              if (item.id === activeItemId && activeBuffer) {
                  bufferToProcess = activeBuffer;
                  loopToProcess = activeItem.loopPoints.find(lp => lp.id === item.selectedLoopId) || null;
              } else {
                  // Otherwise, we must decode it now
                  // Note: We decode sequentially to save memory on iPad
                  try {
                    bufferToProcess = await decodeFile(item.file);
                    
                    // If loops weren't detected yet
                    if (item.status === 'pending' || item.loopPoints.length === 0) {
                         const detected = bufferToProcess.duration > 0.5 
                            ? detectLoopPoints(bufferToProcess) 
                            : [{ id: 1, start: 0, end: bufferToProcess.length - 1, score: 100, name: "Short" }];
                         
                         loopToProcess = detected[0] || null;
                    } else {
                        loopToProcess = item.loopPoints.find(lp => lp.id === item.selectedLoopId) || item.loopPoints[0] || null;
                    }
                  } catch (e) {
                      console.warn(`Skipping ${item.file.name} due to decode error`);
                      continue;
                  }
              }

              if (bufferToProcess && loopToProcess) {
                  const blob = exportWavWithSmpl(bufferToProcess, loopToProcess);
                  let fileName = item.smartName || item.file.name.replace(/\.[^/.]+$/, "");
                  if (!fileName.toLowerCase().endsWith('.wav')) fileName += '.wav';
                  
                  zip.file(fileName, blob);
              }

              processedCount++;
              setExportProgress(Math.round((processedCount / batchItems.length) * 100));
              
              // Small yield to keep UI responsive
              await new Promise(r => setTimeout(r, 10));
          }

          const content = await zip.generateAsync({ type: "blob" });
          const url = URL.createObjectURL(content);
          const a = document.createElement('a');
          a.href = url;
          a.download = `LoopMaster_Batch_${new Date().toISOString().slice(0,10)}.zip`;
          a.click();
          URL.revokeObjectURL(url);

      } catch (err) {
          console.error("Zip export failed", err);
          setErrorMsg("Falha ao gerar ZIP. Tente menos arquivos.");
      } finally {
          setIsExportingZip(false);
          setExportProgress(0);
      }
  };

  return (
    <div className="h-screen w-screen bg-gray-950 text-gray-100 flex overflow-hidden font-sans">
      
      {/* Sidebar (File List) */}
      <div className={`${isSidebarOpen ? 'w-64 sm:w-80' : 'w-0'} transition-all duration-300 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0 h-full relative z-20`}>
          <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="font-bold text-gray-300 flex items-center gap-2">
                  <Archive size={18} className="text-cyan-500"/> 
                  Arquivos ({batchItems.length})
              </h2>
              <button onClick={() => setBatchItems([])} className="text-xs text-red-400 hover:text-red-300" disabled={batchItems.length === 0}>
                  Limpar
              </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {batchItems.map(item => (
                  <div 
                      key={item.id}
                      onClick={() => loadItemForEditing(item.id)}
                      className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all border 
                          ${activeItemId === item.id 
                              ? 'bg-cyan-900/20 border-cyan-500/50 shadow-[inset_0_0_10px_rgba(6,182,212,0.1)]' 
                              : 'bg-gray-800/50 border-transparent hover:bg-gray-800 hover:border-gray-700'}`}
                  >
                      <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${item.status === 'processed' ? 'bg-green-500' : item.status === 'error' ? 'bg-red-500' : 'bg-gray-500'}`} />
                          <div className="flex flex-col min-w-0">
                              <span className={`text-sm truncate font-medium ${activeItemId === item.id ? 'text-cyan-400' : 'text-gray-300'}`}>
                                  {item.smartName || item.file.name}
                              </span>
                              <span className="text-[10px] text-gray-500 truncate">
                                  {(item.file.size / 1024 / 1024).toFixed(2)} MB
                              </span>
                          </div>
                      </div>
                      <button 
                          onClick={(e) => handleRemoveItem(e, item.id)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-900/30 text-red-400 rounded transition-all"
                      >
                          <Trash2 size={14} />
                      </button>
                  </div>
              ))}
          </div>

          <div className="p-4 border-t border-gray-800 bg-gray-900">
               {/* Add Files Button */}
               <div className="relative mb-3">
                    <input 
                        ref={fileInputRef}
                        type="file" 
                        multiple 
                        accept="audio/*, .wav, .mp3"
                        onChange={handleFileUpload}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <button className="w-full flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 py-2 rounded-lg transition-colors">
                        <Upload size={16} />
                        <span>Adicionar Arquivos</span>
                    </button>
               </div>

               {/* Batch Export Button */}
               <button 
                   onClick={exportBatchZip}
                   disabled={batchItems.length === 0 || isExportingZip}
                   className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white py-3 rounded-lg font-bold shadow-lg shadow-cyan-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
               >
                   {isExportingZip ? (
                       <>
                           <Loader2 size={18} className="animate-spin" />
                           <span className="text-sm">{exportProgress}%</span>
                       </>
                   ) : (
                       <>
                           <Download size={18} />
                           <span>Baixar Todos (ZIP)</span>
                       </>
                   )}
               </button>
          </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 relative bg-gray-950 h-full overflow-y-auto">
        
        {/* Mobile Header Toggle */}
        <div className="sm:hidden p-4 flex items-center gap-3 border-b border-gray-800 bg-gray-900 sticky top-0 z-30">
             <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-gray-300">
                 <Menu size={24} />
             </button>
             <h1 className="text-lg font-bold text-cyan-400">LoopMaster AI</h1>
        </div>

        <header className="hidden sm:flex p-6 justify-between items-center">
            <div className="flex items-center gap-3">
                <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-gray-500 hover:text-white transition-colors mr-2">
                    <Menu size={24} />
                </button>
                <div className="w-10 h-10 bg-cyan-500 rounded-full flex items-center justify-center shadow-lg shadow-cyan-500/30">
                    <Music className="text-white w-6 h-6" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600">
                        LoopMaster AI
                    </h1>
                    <p className="text-xs text-gray-500">Batch Processor & Loop Detector</p>
                </div>
            </div>
            <button
                onClick={() => setShowSettings(true)}
                className={`p-2 rounded-lg transition-colors ${hasKey ? 'text-green-400 hover:bg-green-900/20' : 'text-yellow-400 hover:bg-yellow-900/20'}`}
                title={hasKey ? 'API Key configurada' : 'Configurar API Key'}
            >
                <Settings size={22} />
            </button>
        </header>

        {/* Main Workspace */}
        <main className="flex-1 p-4 sm:p-6 flex flex-col gap-6 max-w-5xl mx-auto w-full">
            
            {/* Error Banner */}
            {errorMsg && (
                <div className="bg-red-900/30 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg flex items-center gap-3 animate-in slide-in-from-top-2">
                    <AlertCircle size={20} />
                    <span>{errorMsg}</span>
                </div>
            )}

            {/* Empty State */}
            {!activeItem && !isLoading && (
                 <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] text-gray-500 border-2 border-dashed border-gray-800 rounded-2xl bg-gray-900/20">
                     <FileAudio size={64} className="mb-4 opacity-20" />
                     <p className="text-lg">Selecione um arquivo na lista lateral para editar</p>
                     <p className="text-sm opacity-60">Ou carregue novos arquivos</p>
                 </div>
            )}

            {/* Loading State */}
            {isLoading && !activeBuffer && (
                <div className="flex-1 flex flex-col items-center justify-center min-h-[300px]">
                    <Loader2 className="w-12 h-12 text-cyan-500 animate-spin mb-4" />
                    <p className="text-cyan-400">Processando Áudio...</p>
                </div>
            )}

            {/* Editor */}
            {activeItem && activeBuffer && (
                <div className="space-y-6 animate-in fade-in duration-300">
                    
                    {/* File Metadata Header */}
                    <div className="bg-gray-900 p-4 rounded-xl border border-gray-800 flex flex-wrap gap-4 justify-between items-end">
                        <div className="flex flex-col gap-2 w-full md:w-auto">
                            <label className="text-xs text-gray-500 uppercase tracking-wider">Nome de Saída</label>
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    value={activeItem.smartName}
                                    onChange={(e) => handleNameChange(e.target.value)}
                                    className="bg-gray-800 text-white px-3 py-2 rounded border border-gray-700 focus:border-cyan-500 outline-none w-full md:w-80 font-mono"
                                />
                                <button 
                                    onClick={handleSmartRename}
                                    disabled={isRenaming}
                                    className="p-2 bg-gray-800 hover:bg-gray-700 text-cyan-400 rounded border border-gray-700"
                                    title="Gerar nome com IA"
                                >
                                    {isRenaming ? <Loader2 size={20} className="animate-spin" /> : <Wand2 size={20} />}
                                </button>
                            </div>
                        </div>
                        <div className="flex gap-4 text-xs font-mono text-gray-400">
                             <div>
                                <span className="block text-[10px] text-gray-600 uppercase">Duração</span>
                                {activeBuffer.duration.toFixed(2)}s
                            </div>
                            <div>
                                <span className="block text-[10px] text-gray-600 uppercase">Rate</span>
                                {activeBuffer.sampleRate}Hz
                            </div>
                        </div>
                    </div>

                    {/* Waveform */}
                    <WaveformEditor 
                        buffer={activeBuffer}
                        loopPoint={activeLoop}
                        onLoopPointChange={updateActiveLoop}
                        isPlaying={isPlaying}
                        currentTime={playbackTime}
                        onSeek={handleSeek}
                    />

                    {/* Controls & Loops */}
                    <div className="flex flex-col xl:flex-row items-center gap-6">
                        {/* Transport */}
                        <div className="flex items-center gap-4 shrink-0">
                            <button 
                                onClick={togglePlayback}
                                className={`flex items-center justify-center w-16 h-16 rounded-full transition-all ${isPlaying ? 'bg-red-500 hover:bg-red-600 shadow-red-500/30' : 'bg-cyan-500 hover:bg-cyan-400 shadow-cyan-500/30'} text-black shadow-lg`}
                            >
                                {isPlaying ? <Square fill="currentColor" size={24} /> : <Play fill="currentColor" size={28} className="ml-1"/>}
                            </button>
                            
                            <button 
                                onClick={() => setIsLooping(!isLooping)}
                                className={`flex items-center justify-center w-12 h-12 rounded-full border border-gray-700 transition-all ${isLooping ? 'text-cyan-400 bg-cyan-900/20 border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.2)]' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                <Repeat size={20} />
                            </button>
                        </div>

                        {/* Suggested Loops */}
                        <div className="flex-1 w-full overflow-x-auto pb-2 no-scrollbar">
                            <div className="flex gap-3">
                                {activeItem.loopPoints.map((lp) => (
                                    <button
                                        key={lp.id}
                                        onClick={() => selectLoopId(lp.id)}
                                        className={`px-4 py-3 rounded-lg text-sm font-medium transition-all border whitespace-nowrap min-w-[140px] flex flex-col gap-1 items-start
                                            ${activeItem.selectedLoopId === lp.id 
                                            ? 'bg-gray-800 border-cyan-500 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.1)]' 
                                            : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500'}`}
                                    >
                                        <div className="flex justify-between w-full">
                                            <span>{lp.name}</span>
                                            <span className={`text-[10px] px-1.5 rounded-full font-bold ${lp.score > 80 ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                                {lp.score}%
                                            </span>
                                        </div>
                                        <span className="text-[10px] opacity-50 font-mono">
                                            {(lp.start).toLocaleString()} - {(lp.end).toLocaleString()}
                                        </span>
                                    </button>
                                ))}
                                {activeItem.loopPoints.length === 0 && (
                                    <div className="text-sm text-gray-500 italic p-2">Nenhum loop automático detectado.</div>
                                )}
                            </div>
                        </div>

                        {/* Single Export */}
                        <button
                            onClick={exportSingle}
                            className="shrink-0 flex items-center gap-2 px-6 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white rounded-xl transition-colors"
                        >
                            <Download size={18} />
                            <span className="hidden sm:inline">Baixar (Este)</span>
                        </button>
                    </div>

                </div>
            )}
        </main>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 p-6 w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Key size={20} className="text-cyan-400" />
                Configurações de API
              </h2>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white">
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Groq API Key</label>
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={hasKey ? '••••••••••••••••' : 'gsk_...'}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-cyan-500 outline-none"
                />
              </div>

              <p className="text-xs text-gray-500">
                Obtenha sua chave grátis em{' '}
                <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">
                  console.groq.com/keys
                </a>
              </p>

              <div className="flex gap-3 pt-2">
                {hasKey && (
                  <button
                    onClick={handleClearApiKey}
                    className="flex-1 py-2 px-4 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-lg border border-red-800 transition-colors"
                  >
                    Remover Chave
                  </button>
                )}
                <button
                  onClick={handleSaveApiKey}
                  disabled={apiKeyInput.trim().length < 10}
                  className="flex-1 py-2 px-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Salvar
                </button>
              </div>

              {hasKey && (
                <div className="flex items-center gap-2 text-green-400 text-sm pt-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full" />
                  API Key configurada
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;